const priority = {product: 26, news: 12, support: 6, page: 2, release: 0};

function normalize(value) {
    return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function findResults(index, value) {
    const query = normalize(value.slice(0, 120));
    if (!query) return [];
    const terms = [...new Set(query.split(' '))];
    const results = [];
    for (const entry of index) {
        const title = normalize(entry.title);
        const description = normalize(entry.description);
        const keywords = normalize(entry.terms ?? '');
        const matches = terms.map(term => {
            if (title.includes(term)) return 12;
            if (description.includes(term)) return 4;
            if (keywords.includes(term)) return 2;
            return 0;
        });
        if (matches.includes(0)) continue;
        const phrase = title.includes(query) ? 15 : 0;
        const exactTitle = title === query ? 8 : 0;
        const score = matches.reduce((sum, weight) => sum + weight, 0)
            + phrase + exactTitle + priority[entry.kind];
        results.push({entry, score});
    }
    return results.sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
        .map(result => result.entry);
}

let indexRequest;
function loadIndex() {
    indexRequest ??= fetch('/assets/site-search.json', {cache: 'no-cache'}).then(response => {
        if (!response.ok) throw new Error('Search index unavailable');
        return response.json();
    }).catch(error => {
        indexRequest = undefined;
        throw error;
    });
    return indexRequest;
}

function resultItem(result) {
    const item = document.createElement('li');
    const label = document.createElement('small');
    const link = document.createElement('a');
    const description = document.createElement('p');
    label.textContent = result.label;
    link.textContent = result.title;
    link.href = result.url;
    description.textContent = result.description;
    item.append(label, link, description);
    return item;
}

function setupSearch() {
    const form = document.querySelector('[data-studio-search]');
    const panel = document.querySelector('[data-search-results]');
    if (!form || !panel) return;
    const input = form.querySelector('[name="q"]');
    const list = panel.querySelector('[data-search-list]');
    const status = panel.querySelector('[data-search-status]');
    const preview = panel.hasAttribute('data-preview');

    async function refresh() {
        const value = input.value.trim();
        list.replaceChildren();
        if (!normalize(value)) {
            panel.hidden = preview;
            status.textContent = 'Enter a title, topic, or platform.';
            return;
        }
        panel.hidden = false;
        status.textContent = 'Searching…';
        try {
            const index = await loadIndex();
            if (input.value.trim() !== value) return;
            const matches = findResults(index, value);
            const results = preview ? matches.filter(entry => entry.kind !== 'release').slice(0, 4) : matches;
            list.replaceChildren(...results.map(resultItem));
            panel.hidden = preview && results.length === 0;
            status.textContent = results.length
                ? `${results.length} ${results.length === 1 ? 'result' : 'results'}`
                : 'No matches. Try a title, platform, or support topic.';
        } catch {
            if (input.value.trim() !== value) return;
            status.textContent = 'Search is temporarily unavailable. Try again in a moment.';
        }
    }

    if (preview) {
        input.addEventListener('input', refresh);
        if (input.value) refresh();
    } else {
        input.value = (new URLSearchParams(window.location.search).get('q') ?? '').slice(0, 120);
        refresh();
    }
}

if (typeof document !== 'undefined') setupSearch();
