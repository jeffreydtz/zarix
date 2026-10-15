-- Reviewable Arc permission preflight. Do not run before explicit human authorization.
-- Target is fixed to the isolated scratch application. No existing window/tab is queried.
-- Uses only object references returned by make; closes only that newly created window.
-- Does not activate Arc, enumerate windows/tabs, read cookies/storage, or change any setting.
set testWindow to missing value
set testTab to missing value
set stageName to "create_incognito_window"
set outcomeJSON to "{\"status\":\"NOT_EXECUTED\"}"
set cleanupConfirmed to false

try
    with timeout of 20 seconds
        tell application id "company.thebrowser.Browser"
            set testWindow to make new window with properties {mode:"incognito"}
            set stageName to "verify_own_incognito_window"
            if incognito of testWindow is not true then error number -27001
            set stageName to "create_own_local_tab"
            set testTab to make new tab with properties {URL:"http://127.0.0.1:3002/login"} at end of tabs of testWindow
            set stageName to "wait_own_tab"
            repeat 40 times
                if loading of testTab is false then exit repeat
                delay 0.25
            end repeat
            set stageName to "inspect_own_local_dom"
            -- May fail if Arc's JavaScript-from-AppleEvents option is disabled.
            -- Never enable that option automatically; report the error and close our window.
            set ownDOM to execute testTab javascript "(() => { if (location.origin !== 'http://127.0.0.1:3002') return JSON.stringify({status:'UNEXPECTED_ORIGIN'}); return JSON.stringify({status:'LOCAL_DOM_READ',origin:location.origin,path:location.pathname,readyState:document.readyState,h1Count:document.querySelectorAll('h1').length,formCount:document.forms.length,passwordInputCount:document.querySelectorAll('input[type=password]').length}); })()"
            set outcomeJSON to "{\"status\":\"PREFLIGHT_DOM_RETURNED\",\"dom\":" & ownDOM & "}"
        end tell
    end timeout
on error unusedMessage number errorNumber
    -- Do not emit the error's free-form message: only stage and numeric OSStatus.
    set outcomeJSON to "{\"status\":\"BLOCKED\",\"stage\":\"" & stageName & "\",\"osStatus\":" & errorNumber & "}"
end try

-- Finally: close only the window reference returned by this script, never front window.
try
    if testWindow is not missing value then
        with timeout of 10 seconds
            tell application id "company.thebrowser.Browser" to close testWindow
        end timeout
        set cleanupConfirmed to true
    else
        -- A timed-out create operation can have unknown effects; do not enumerate to guess.
        set cleanupConfirmed to false
    end if
on error
    set cleanupConfirmed to false
end try

if cleanupConfirmed then
    return "{\"result\":" & outcomeJSON & ",\"ownWindowCloseConfirmed\":true}"
else
    return "{\"result\":" & outcomeJSON & ",\"ownWindowCloseConfirmed\":false,\"cleanupStatus\":\"UNCONFIRMED_DO_NOT_CLOSE_OTHER_WINDOWS\"}"
end if
