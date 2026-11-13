# Website Link for Desktop Buddy Preview6

Optional source adapter for https://www.drunkyetistudio.com/desktop-buddy/.
It adds Tools and friends → Website link to the existing compact menu.

## Install

1. Close Buddy. Extract this ZIP outside your Buddy source directory.
2. Use the Python environment used by Buddy's source launcher:

   Windows: `py install.py "C:\path\to\DrunkYetiBuddy"`

   macOS/Linux: `python3 install.py "/path/to/DrunkYetiBuddy"`

3. Restart Buddy with its usual source launcher. Enable Website link, copy the code,
   open the official connection page and connect. Keep the native link window open.
4. Allow local-network/loopback access if your desktop browser prompts. If it blocks
   the connection, the page reports failure; use the apps independently.

The installer changes buddy_menu.py and adds web_bridge.py and website_link.py.
It preserves buddy_menu.py.before-website-link. Your .git, settings, accounts,
Suite v1 and companion protocols are untouched. No packages are installed.
This is an adapter, not a full Buddy source distribution or signed native build.
Compiled apps need rebuilding on their target OS; existing executables do not change.

## What works

Website → Buddy: wave or surprised reaction when Buddy is available.
Buddy → website: wave or a short snow effect, from the native connection window.
Only this connection page receives effects; other pages and tabs are not controlled.
Reduced motion suppresses animation. Hidden tabs stop polling. Sleep, focus,
quiet, presentation, busy play and hidden Buddy state block incoming reactions.

## Privacy and disconnection

The listener starts only when enabled and binds only 127.0.0.1:47864.
Exact official HTTPS origins and Host, JSON, and a random 128-bit session token
are required. Pairing is kept in memory, never in account storage or page URLs.
It expires in 30 minutes; closing the native link window shuts down the listener.
The native Copy button uses your clipboard; closing clears it only if it still
contains the current code. No identity, files, browser history or credentials
are exposed. The website gets readiness plus a small list of cosmetic events.
This local token is not a Drunk Yeti account token. No arbitrary commands,
paths, text, URLs or coordinates are accepted by the server.

## Remove

Close Buddy, restore buddy_menu.py from buddy_menu.py.before-website-link if you
have not made subsequent menu changes, and remove the two added Python modules.
If you changed the menu since installation, remove only the website_link import
and add_website_link call instead of overwriting your edits.

## Validation limits

The HTTP boundary and browser client have automated tests. A Qt adapter smoke
check is separate from full native Buddy acceptance. Windows/macOS packaging,
signing, browser permission behavior and a real user desktop session require
native acceptance; they are not claimed by the source adapter release.
