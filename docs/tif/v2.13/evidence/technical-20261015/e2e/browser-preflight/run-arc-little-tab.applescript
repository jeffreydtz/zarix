-- PREPARED ONLY. Never run before parent confirms prior unknown-window cleanup.
-- Arc.sdef application.tabs is write-only and documents creation of a new Little Arc tab.
-- No existing window/tab query, front window, activation, quit or preference change.
on safeUUID(v)
    if (count characters of v) is not 36 then return false
    repeat with n from 1 to 36
        set c to character n of v
        if n is in {9, 14, 19, 24} then
            if c is not "-" then return false
        else
            if c is not in "0123456789abcdefABCDEF" then return false
        end if
    end repeat
    return true
end safeUUID

on checkpoint(checkpointPath, jsonText)
    set handleRef to open for access (POSIX file checkpointPath) with write permission
    try
        set eof handleRef to 0
        write jsonText to handleRef as «class utf8»
        close access handleRef
    on error
        try
            close access handleRef
        end try
        error number -27003
    end try
end checkpoint

on run argv
    if (count argv) is not 1 then error number -27004
    set checkpointPath to item 1 of argv
    if checkpointPath does not start with "/tmp/zarix-runtime-20261015/arc-little-tab-" then error number -27004
    if checkpointPath does not end with "/checkpoint.json" then error number -27004
    set madeTab to false
    set ownedTab to missing value
    set ownedId to ""
    set stageName to "make_own_little_arc_tab"
    set closeAcknowledged to false
    set noLongerResolvable to false
    set outcomeJSON to "{\"status\":\"NOT_EXECUTED\"}"
    try
        with timeout of 20 seconds
            tell application id "company.thebrowser.Browser"
                set ownedTab to make new tab with properties {URL:"http://127.0.0.1:3002/login"}
                set madeTab to true
                -- Source-form descriptor logging precedes any property resolution.
                -- The driver captures stderr directly to a private0600 file; only UUID metadata is publishable.
                log "ZARIX_OWN_RETURNED_DESCRIPTOR"
                log ownedTab
                my checkpoint(checkpointPath, "{\"stage\":\"MAKE_RETURNED_REFERENCE_HELD\",\"ownTabId\":null}")
                set stageName to "capture_own_returned_id"
                -- Registration may be asynchronous; retry only this returned object reference.
                -- No second make, enumeration or front-window fallback is allowed.
                repeat 40 times
                    try
                        set candidateId to id of ownedTab as text
                        if my safeUUID(candidateId) is not true then error number -27002
                        set ownedId to candidateId
                        exit repeat
                    on error unusedIdMessage number idError
                        if idError is not -1728 then error number idError
                    end try
                    delay 0.25
                end repeat
                if ownedId is "" then error number -1728
                my checkpoint(checkpointPath, "{\"stage\":\"OWN_RETURNED_ID_CAPTURED\",\"ownTabId\":\"" & ownedId & "\"}")
                set stageName to "wait_own_local_tab"
                repeat 40 times
                    if loading of ownedTab is false then exit repeat
                    delay 0.25
                end repeat
                set stageName to "inspect_own_local_dom"
                set ownDOM to execute ownedTab javascript "(() => { if(location.origin!=='http://127.0.0.1:3002') return JSON.stringify({status:'UNEXPECTED_ORIGIN'}); return JSON.stringify({status:'LOCAL_DOM_READ',origin:location.origin,path:location.pathname,readyState:document.readyState,h1Count:document.querySelectorAll('h1').length,formCount:document.forms.length,passwordInputCount:document.querySelectorAll('input[type=password]').length}); })()"
                set outcomeJSON to "{\"status\":\"PREFLIGHT_DOM_RETURNED\",\"dom\":" & ownDOM & "}"
            end tell
        end timeout
    on error errorText number errorNumber
        set reasonCode to "NATIVE_SCRIPT_ERROR"
        if errorText contains "Allow JavaScript from Apple Events" then set reasonCode to "JAVASCRIPT_APPLEEVENTS_SETTING_REQUIRED_NOT_CHANGED"
        set outcomeJSON to "{\"status\":\"BLOCKED\",\"stage\":\"" & stageName & "\",\"osStatus\":" & errorNumber & ",\"reason\":\"" & reasonCode & "\"}"
    end try
    -- Boolean guard avoids resolving the object merely to compare it with missing value.
    if madeTab then
        try
            with timeout of 10 seconds
                tell application id "company.thebrowser.Browser" to close ownedTab
            end timeout
            set closeAcknowledged to true
            if ownedId is not "" then
                try
                    tell application id "company.thebrowser.Browser" to get id of ownedTab
                on error unusedCloseMessage number closeError
                    if closeError is -1728 then set noLongerResolvable to true
                end try
            end if
        end try
    end if
    set closeText to "false"
    if closeAcknowledged then set closeText to "true"
    set absenceText to "false"
    if noLongerResolvable then set absenceText to "true"
    set idJSON to "null"
    if ownedId is not "" then set idJSON to "\"" & ownedId & "\""
    set finalJSON to "{\"result\":" & outcomeJSON & ",\"ownTabId\":" & idJSON & ",\"ownTabCloseAcknowledged\":" & closeText & ",\"ownTabNoLongerResolvableAfterClose\":" & absenceText & "}"
    my checkpoint(checkpointPath, finalJSON)
    return finalJSON
end run
