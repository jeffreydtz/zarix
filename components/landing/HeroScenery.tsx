/**
 * Full-bleed illustrated alpine scenery for the landing hero (daylight,
 * emerald-family palette). Pure layered SVG — no external image assets.
 * Illustration artwork colors are intentionally literal (see DESIGN.md,
 * "Landing hero illustration"): this is artwork, not UI chrome; all UI
 * rendered on top keeps using tokens.
 */
export default function HeroScenery() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg
        className="h-full w-full"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMax slice"
        role="presentation"
      >
        <defs>
          <linearGradient id="zx-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#BFDCF2" />
            <stop offset="45%" stopColor="#DCEDF8" />
            <stop offset="100%" stopColor="#F4FAF7" />
          </linearGradient>
          <linearGradient id="zx-far-range" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#9DBFCC" />
            <stop offset="100%" stopColor="#C4DAD9" />
          </linearGradient>
          <linearGradient id="zx-mid-range" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7FAF9B" />
            <stop offset="100%" stopColor="#A9CCB8" />
          </linearGradient>
          <linearGradient id="zx-hill-left" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5CA97E" />
            <stop offset="100%" stopColor="#3E8A61" />
          </linearGradient>
          <linearGradient id="zx-meadow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4F9F6E" />
            <stop offset="100%" stopColor="#2C7A4E" />
          </linearGradient>
          <linearGradient id="zx-meadow-front" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3C8E5F" />
            <stop offset="100%" stopColor="#226844" />
          </linearGradient>
          <linearGradient id="zx-fog" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#EAF4F1" stopOpacity="0" />
            <stop offset="100%" stopColor="#EAF4F1" stopOpacity="0.9" />
          </linearGradient>
          <filter id="zx-soft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
          <filter id="zx-softer" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="26" />
          </filter>
        </defs>

        {/* sky */}
        <rect width="1440" height="900" fill="url(#zx-sky)" />

        {/* sun glow */}
        <circle cx="1080" cy="180" r="150" fill="#FFF8E7" opacity="0.75" filter="url(#zx-softer)" />

        {/* clouds */}
        <g fill="#FFFFFF" filter="url(#zx-soft)">
          <ellipse cx="260" cy="180" rx="190" ry="42" opacity="0.85" />
          <ellipse cx="390" cy="150" rx="120" ry="30" opacity="0.7" />
          <ellipse cx="900" cy="110" rx="150" ry="30" opacity="0.6" />
          <ellipse cx="1230" cy="260" rx="200" ry="38" opacity="0.75" />
          <ellipse cx="640" cy="240" rx="110" ry="22" opacity="0.5" />
        </g>

        {/* far snowy range */}
        <path
          d="M0 560 L120 470 L210 520 L330 420 L430 500 L560 430 L660 510 L780 440 L900 515 L1020 435 L1140 505 L1260 450 L1360 510 L1440 470 L1440 700 L0 700 Z"
          fill="url(#zx-far-range)"
        />
        {/* snow caps */}
        <g fill="#F6FBFD" opacity="0.9">
          <path d="M330 420 L365 450 L345 452 L310 445 Z" />
          <path d="M560 430 L594 458 L570 460 L534 452 Z" />
          <path d="M1020 435 L1052 462 L1030 464 L996 456 Z" />
          <path d="M120 470 L150 494 L128 496 L98 488 Z" />
        </g>

        {/* fog band between ranges */}
        <rect x="0" y="520" width="1440" height="140" fill="url(#zx-fog)" />

        {/* mid green range */}
        <path
          d="M0 660 L90 590 L200 640 L320 570 L450 645 L600 585 L730 650 L870 595 L1010 655 L1150 600 L1290 655 L1440 605 L1440 780 L0 780 Z"
          fill="url(#zx-mid-range)"
        />

        {/* rolling hill left */}
        <path
          d="M0 760 C 220 640 480 660 760 730 C 980 782 1200 788 1440 742 L1440 900 L0 900 Z"
          fill="url(#zx-hill-left)"
        />

        {/* meadow */}
        <path
          d="M0 812 C 260 730 620 742 900 796 C 1120 836 1300 838 1440 806 L1440 900 L0 900 Z"
          fill="url(#zx-meadow)"
        />

        {/* foreground meadow lip */}
        <path
          d="M0 872 C 320 812 760 818 1080 862 C 1230 882 1360 884 1440 872 L1440 900 L0 900 Z"
          fill="url(#zx-meadow-front)"
        />

        {/* pine clusters — left */}
        <g>
          <g fill="#1D5C3B">
            <path d="M120 828 L152 758 L184 828 Z" />
            <path d="M128 792 L152 736 L176 792 Z" />
            <rect x="147" y="826" width="10" height="18" fill="#3A4A32" />
          </g>
          <g fill="#174A30">
            <path d="M62 842 L88 784 L114 842 Z" />
            <path d="M68 812 L88 766 L108 812 Z" />
            <rect x="84" y="840" width="8" height="15" fill="#3A4A32" />
          </g>
          <g fill="#226746">
            <path d="M196 846 L220 792 L244 846 Z" />
            <path d="M202 818 L220 776 L238 818 Z" />
            <rect x="216" y="844" width="8" height="14" fill="#3A4A32" />
          </g>
        </g>

        {/* pine clusters — right */}
        <g>
          <g fill="#1D5C3B">
            <path d="M1300 820 L1334 746 L1368 820 Z" />
            <path d="M1308 782 L1334 724 L1360 782 Z" />
            <rect x="1329" y="818" width="10" height="20" fill="#3A4A32" />
          </g>
          <g fill="#174A30">
            <path d="M1382 842 L1408 786 L1434 842 Z" />
            <path d="M1388 812 L1408 768 L1428 812 Z" />
            <rect x="1404" y="840" width="8" height="15" fill="#3A4A32" />
          </g>
          <g fill="#226746">
            <path d="M1244 850 L1266 800 L1288 850 Z" />
            <path d="M1250 824 L1266 786 L1282 824 Z" />
            <rect x="1262" y="848" width="8" height="13" fill="#3A4A32" />
          </g>
        </g>

        {/* wildflowers on the front meadow */}
        <g>
          <g fill="#FFD75E">
            <circle cx="240" cy="876" r="3.2" />
            <circle cx="310" cy="886" r="2.6" />
            <circle cx="450" cy="874" r="3" />
            <circle cx="1120" cy="880" r="3" />
            <circle cx="1188" cy="872" r="2.4" />
          </g>
          <g fill="#F8FAFC">
            <circle cx="180" cy="884" r="2.6" />
            <circle cx="395" cy="882" r="2.4" />
            <circle cx="520" cy="880" r="2.8" />
            <circle cx="1040" cy="876" r="2.6" />
            <circle cx="1256" cy="884" r="2.6" />
          </g>
          <g fill="#C9A7F2">
            <circle cx="275" cy="880" r="2.2" />
            <circle cx="480" cy="886" r="2" />
            <circle cx="1082" cy="884" r="2.2" />
            <circle cx="1222" cy="878" r="2" />
          </g>
        </g>

        {/* birds — kept in open sky, clear of the headline/subcopy area */}
        <g stroke="#5B7A8C" strokeWidth="2.4" strokeLinecap="round" fill="none" opacity="0.65">
          <path d="M170 340 q7 -8 14 0 q7 -8 14 0" />
          <path d="M226 362 q6 -7 12 0 q6 -7 12 0" />
          <path d="M132 376 q5 -6 10 0 q5 -6 10 0" />
        </g>
      </svg>
    </div>
  );
}
