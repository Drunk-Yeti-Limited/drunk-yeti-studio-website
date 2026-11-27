"""Shared storefront branding for static release links."""
from html import escape
from urllib.parse import urlsplit

MICROSOFT_PUBLISHER = 'https://apps.microsoft.com/search/publisher?name=Drunk+Yeti+Studio&hl=en-US&gl=US'
ICONS = {
    'play.google.com': 'googleplay',
    'store.steampowered.com': 'steam',
    'drunkyeti.itch.io': 'itchio',
}


def store_link(url, label, classes):
    host = urlsplit(url).hostname
    href = escape(url, quote=True)
    if host == 'apps.microsoft.com':
        return (
            f'<a class="{classes} store-link microsoft-link" href="{href}">'
            f'<img src="/assets/store-icons/microsoft.svg" alt="{escape(label, quote=True)}" width="144" height="52"></a>'
        )
    icon = ICONS.get(host)
    image = f'<img src="/assets/store-icons/{icon}.svg" alt="" width="18" height="18">' if icon else ''
    return f'<a class="{classes} store-link" href="{href}">{image}{escape(label)}</a>'
