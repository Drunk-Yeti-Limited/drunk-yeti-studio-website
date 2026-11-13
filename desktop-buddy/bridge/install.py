"""Install the optional Website Link into a Buddy Preview6 source checkout.
Usage: python install.py /path/to/DrunkYetiBuddy
No packages, credentials, network access or Git operations are performed.
"""
import argparse
from pathlib import Path
import shutil


def install(root):
    root = Path(root).resolve()
    menu = root/'buddy_menu.py'
    if not (root/'buddy.py').is_file() or not menu.is_file():
        raise ValueError('Choose the Buddy source folder containing buddy.py and buddy_menu.py.')
    source = menu.read_text(encoding='utf-8')
    marker = '    menu.addAction(b.presentation_action);'
    hook = '    from website_link import add_website_link\n    add_website_link(b, tools)\n'
    if 'add_website_link(b, tools)' not in source:
        if source.count(marker) != 1:
            raise ValueError('Menu layout differs from Preview6. No files changed; request an updated adapter.')
        backup = menu.with_name('buddy_menu.py.before-website-link')
        if backup.exists():
            raise ValueError('A previous menu backup exists. Review it before installing; nothing changed.')
        for name in ('website_link.py','web_bridge.py'):
            target = root/name
            if target.exists() and target.read_bytes() != (Path(__file__).parent/name).read_bytes():
                raise ValueError(name+' already exists with different contents. Nothing changed.')
        shutil.copy2(menu,backup)
        for name in ('website_link.py','web_bridge.py'):
            shutil.copy2(Path(__file__).parent/name,root/name)
        menu.write_text(source.replace(marker,hook+marker),encoding='utf-8')
    else:
        for name in ('website_link.py','web_bridge.py'):
            if not (root/name).is_file() or (root/name).read_bytes() != (Path(__file__).parent/name).read_bytes():
                raise ValueError('An existing Website Link differs or is incomplete. Review the source before updating.')
    print('Website Link installed. Restart Buddy using its source launcher. Open Tools and friends → Website link.')

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('buddy_source',type=Path)
    args=parser.parse_args()
    try:
        install(args.buddy_source)
    except (OSError,ValueError) as error:
        parser.exit(1,str(error)+'\n')
