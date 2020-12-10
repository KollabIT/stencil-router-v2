import { Build, h, writeTask } from '@stencil/core';
import { createStore } from '@stencil/store';

const isFunction = (v) => typeof v === 'function';
const isPromise = (v) => !!v && (typeof v === 'object' || isFunction(v)) && isFunction(v.then);
const isString = (v) => typeof v === 'string';
const normalizePathname = (url) => url.pathname.toLowerCase();
const urlToPath = (url) => normalizePathname(url) + url.search;
const shouldPushState = (loc, newUrl) => urlToPath(loc) !== urlToPath(newUrl);
const handlePushState = (win, loc, hstry, isFromPopState, newUrl) => {
    const pathBeforePush = urlToPath(loc);
    const newHref = newUrl.href;
    const hasHash = newUrl.hash.startsWith('#');
    if (shouldPushState(loc, newUrl)) {
        hstry.pushState(null, '', newHref);
    }
    if (!isFromPopState) {
        if (pathBeforePush !== urlToPath(newUrl)) {
            if (hasHash) {
                loc.href = newHref;
            }
            else {
                win.scrollTo(0, 0);
            }
        }
        else if (hasHash) {
            loc.href = newHref;
        }
    }
};
const devDebug = (msg) => {
    if (Build.isDev) {
        console.debug.apply(console, [
            '%crouter',
            `background: #717171; color: white; padding: 2px 3px; border-radius: 2px; font-size: 0.8em;`,
            msg,
        ]);
    }
};

let defaultRouter;
const createWindowRouter = (win, doc, loc, hstry, opts) => {
    let hasQueuedView = false;
    let lastHref = loc.href;
    const onChanges = [];
    const onBeforeChanges = [];
    const urlFromHref = (href) => new URL(href, doc.baseURI);
    const { state, dispose } = createStore({
        href: lastHref,
        path: urlToPath(loc),
        hash: loc.hash,
        views: [],
        popState: false,
    });
    const pushState = (updateUrl) => {
        try {
            const path = urlToPath(updateUrl);
            if (path != null) {
                devDebug(`pushState: ${path}`);
                state.href = updateUrl.href;
            }
        }
        catch (e) {
            console.error(e);
        }
    };
    const match = (testUrl, routes) => {
        for (let i = 0; i < routes.length; i++) {
            const route = routes[i];
            const params = matchPath(normalizePathname(testUrl), route.path);
            if (params) {
                if (route.to != null) {
                    pushState(urlFromHref(route.to));
                    return match(urlFromHref(route.to), routes);
                }
                else {
                    return { params, route, index: i };
                }
            }
        }
        return undefined;
    };
    const push = async (href, isFromPopState = false) => {
        const pushToUrl = urlFromHref(href);
        if (state.href !== pushToUrl.href) {
            onBeforeChanges.forEach(cb => {
                try {
                    cb(urlFromHref(href), urlFromHref(lastHref));
                }
                catch (e) {
                    console.error(e);
                }
            });
            try {
                if (opts === null || opts === void 0 ? void 0 : opts.beforePush) {
                    await opts.beforePush(pushToUrl);
                }
            }
            catch (e) {
                console.error(e);
            }
            state.href = pushToUrl.href;
            state.popState = isFromPopState;
        }
        else if (!isFromPopState && pushToUrl.hash !== '') {
            loc.href = pushToUrl.href;
        }
    };
    const createSwitchChildren = (matchedViewChildren, hasRouteEntryChanged) => {
        pushView(matchedViewChildren);
        hasQueuedView = false;
        const views = state.views;
        if (hasRouteEntryChanged && views.length > 1) {
            for (const view of views) {
                if (view.s === 0 /* QUEUED */) {
                    checkForQueuedView(view);
                }
                if (!hasQueuedView) {
                    // the view being added didn't have any children that
                    // requires a transition, just stop here and only show the active
                    break;
                }
            }
        }
        if (hasQueuedView && views.length > 1) {
            for (const view of views) {
                view.c = updateQueuedView(view);
            }
        }
        else {
            views[0].c = matchedViewChildren;
        }
        updateSwitchVNodes();
    };
    const pushView = (matchedViewChildren) => {
        const views = state.views;
        if (views.length === 0 || (views.length > 0 && views[0].h !== state.href)) {
            state.views = [
                {
                    s: 0 /* QUEUED */,
                    c: matchedViewChildren,
                    h: state.href,
                    o: state.popState,
                    p: [],
                },
                ...views
                    .filter(v => v.s !== 0 /* QUEUED */)
                    .map(v => ({ ...v, s: 2 /* LEAVING */ })),
            ];
        }
    };
    const checkForQueuedView = (view) => {
        h((_t, _c, utils) => {
            const vchildren = Array.isArray(view.c) ? view.c : [view.c];
            utils.forEach(vchildren, (vnode, i) => {
                if (vnode &&
                    !isString(view.c[i]) &&
                    isString(vnode.vtag) &&
                    vnode.vtag.includes('-')) {
                    hasQueuedView = true;
                }
            });
        }, null);
    };
    const updateQueuedView = (view) => h((_t, _c, utils) => {
        const vchildren = Array.isArray(view.c) ? view.c : [view.c];
        const hChildren = utils.map(vchildren, (vnode, i) => {
            if (isString(vchildren[i])) {
                // text nodes are not mapped correctly with the function utils
                return vchildren[i];
            }
            if (vnode && hasQueuedView && view.s === 0 /* QUEUED */) {
                vnode.vattrs = vnode.vattrs || {};
                vnode.vattrs.class =
                    (vnode.vattrs.class || '') + ' stencil-router-queue';
                const userRef = vnode.vattrs.ref;
                vnode.vattrs.ref = (el) => {
                    addComponentOnReady(view, el);
                    if (userRef) {
                        userRef(el);
                    }
                };
            }
            return vnode;
        });
        return hChildren;
    }, null);
    const addComponentOnReady = (view, el) => {
        if (el) {
            if (el.componentOnReady) {
                view.p.push(el.componentOnReady());
            }
            const children = el.children;
            for (let i = 0; i < children.length; i++) {
                addComponentOnReady(view, children[i]);
            }
        }
    };
    const updateSwitchVNodes = () => {
        if (!hasQueuedView) {
            state.views = [state.views[0]];
        }
        if (state.views.length === 1) {
            state.views[0].s = 1 /* ACTIVE */;
        }
        else {
            const queuedViews = state.views.filter(v => v.s === 0 /* QUEUED */);
            if (queuedViews.length > 0) {
                queuedViews.forEach(v => {
                    if (Array.isArray(v.c)) {
                        v.c = v.c.map(c => (isString(c) ? '' : c));
                    }
                });
                writeTask(async () => {
                    const activeView = state.views[0];
                    await Promise.all(activeView.p);
                    activeView.s = 1 /* ACTIVE */;
                    state.views = [activeView];
                });
                return;
            }
        }
        const view = state.views[0];
        const newUrl = urlFromHref(view.h);
        const newHref = newUrl.href;
        if (lastHref !== newHref) {
            handlePushState(win, loc, hstry, view.o, newUrl);
            state.path = urlToPath(newUrl);
            state.hash = newUrl.hash;
            onChanges.forEach((cb) => {
                try {
                    cb(urlFromHref(newHref), urlFromHref(lastHref));
                }
                catch (e) {
                    console.error(e);
                }
            });
            lastHref = newHref;
        }
    };
    const onPopState = (ev) => {
        devDebug(`onPopState to: ${loc.pathname}`);
        if (isFunction(opts.reloadOnPopState) && opts.reloadOnPopState(ev)) {
            // if there's an event then it's from 'popstate' event
            // and we didn't have cached state and didn't have
            // state in the <script> element, probably when full
            // reloading page 2, and hitting the back button to page 1 that
            // would be in the user's browserhistory, but nothing in-memory
            // in this window instance, so let's do a full page reload
            // cuz we don't have any data we can load synchronously
            loc.reload();
        }
        else {
            // we've got an entirely different path and we
            // we ensured we have synchronous static state ready to go
            // changing of only the hash should not trigger a push
            return push(loc.href, true);
        }
    };
    const getRouteChildren = (matchResult) => {
        const route = matchResult === null || matchResult === void 0 ? void 0 : matchResult.route;
        if (route) {
            if (isFunction(route.jsx)) {
                const pageState = route.mapParams
                    ? route.mapParams(matchResult.params, urlFromHref(state.href))
                    : undefined;
                if (Build.isServer) {
                    if (isPromise(pageState)) {
                        return pageState
                            .then(resolvedPagedState => route.jsx(matchResult.params, resolvedPagedState))
                            .catch(err => {
                            console.error(err);
                            return route.jsx(matchResult.params);
                        });
                    }
                }
                return route.jsx(matchResult.params, pageState);
            }
            else {
                return route.jsx;
            }
        }
    };
    const Switch = (_, childrenRoutes) => {
        devDebug(`switch render: ${state.href}`);
        const matchResult = match(urlFromHref(state.href), childrenRoutes);
        if (matchResult) {
            const matchedViewChildren = getRouteChildren(matchResult);
            const activeMatchResult = match(urlFromHref(loc.href), childrenRoutes);
            const hasRouteEntryChanged = (activeMatchResult === null || activeMatchResult === void 0 ? void 0 : activeMatchResult.index) !== (matchResult === null || matchResult === void 0 ? void 0 : matchResult.index);
            if (matchedViewChildren) {
                if (Build.isServer) {
                    // server-side only, no transitions
                    return matchedViewChildren;
                }
                createSwitchChildren(matchedViewChildren, hasRouteEntryChanged);
                return state.views
                    .slice()
                    .reverse()
                    .map(v => v.c);
            }
        }
    };
    const on = (type, cb) => (type === 'change' ? onChanges : onBeforeChanges).push(cb);
    const router = (defaultRouter = {
        Switch,
        get path() {
            return state.path;
        },
        get hash() {
            return state.hash;
        },
        push,
        on,
        onHrefRender: navigateToUrl => {
            if (isFunction(opts.onHrefRender)) {
                opts.onHrefRender(navigateToUrl, urlFromHref(state.href));
            }
        },
        preload: opts => {
            if (!doc.head.querySelector(`link[href="${opts.href}"]`)) {
                const lnk = doc.createElement('link');
                lnk.href = opts.href;
                if (opts.as === 'module') {
                    lnk.rel = 'modulepreload';
                }
                else {
                    lnk.rel = 'prefetch';
                    lnk.as = opts.as;
                }
                doc.head.appendChild(lnk);
            }
        },
        dispose: () => {
            defaultRouter = undefined;
            win.removeEventListener('popstate', onPopState);
            dispose();
        },
        serializeURL: urlToPath,
    });
    // listen URL changes
    win.addEventListener('popstate', onPopState);
    return {
        router,
        state,
    };
};
const href = (href, router = defaultRouter) => {
    if (typeof href !== 'string') {
        return {};
    }
    const baseURI = document.baseURI;
    const goToUrl = new URL(href, baseURI);
    if (href.startsWith('#') || goToUrl.host !== new URL(baseURI).host) {
        return {
            href,
        };
    }
    if (Build.isDev) {
        if (!router || !isFunction(router.push)) {
            console.error('Router must be defined in href()', href);
            return {
                href,
            };
        }
        const baseName = goToUrl.pathname.split('/').pop();
        if (baseName.indexOf('.') > -1) {
            console.error('Router href() should only be used for a page link, without an extension, and not for an asset', href);
            return {
                href,
            };
        }
    }
    router.onHrefRender(goToUrl);
    const anchor = href.includes('#') ? `#${href.split('#')[1]}` : '';
    return {
        href: router.serializeURL(goToUrl) + anchor,
        onClick: (ev) => {
            if (!ev.metaKey && !ev.ctrlKey && ev.which != 2 && ev.button != 1) {
                ev.preventDefault();
                router.push(href);
            }
        },
    };
};
const Route = (props, children) => {
    var _a;
    if ('to' in props) {
        const entry = {
            path: props.path,
            to: props.to,
        };
        return entry;
    }
    if (Build.isDev && props.render && children.length > 0) {
        console.warn('Route: if `render` is provided, the component should not have any children');
    }
    const entry = {
        path: props.path,
        id: props.id,
        jsx: (_a = props.render) !== null && _a !== void 0 ? _a : children,
        mapParams: props.mapParams,
    };
    return entry;
};
const matchPath = (pathname, path) => {
    if (isString(path)) {
        if (path === pathname) {
            return {};
        }
    }
    else if (isFunction(path)) {
        const params = path(pathname);
        if (params) {
            return params === true ? {} : { ...params };
        }
    }
    else {
        const results = path.exec(pathname);
        if (results) {
            path.lastIndex = 0;
            return { ...results };
        }
    }
    return undefined;
};
const createRouter = (opts = {}) => createWindowRouter(window, document, location, history, opts).router;
const NotFound = () => { };

const setDocumentStaticData = (inputData) => {
    // server-side only
    const { data, toString } = createProxiedStaticData(inputData);
    addEventListener('DOMContentLoaded', () => {
        let staticDataElm = document.querySelector('[data-stencil-static="page.state"]');
        if (!staticDataElm) {
            staticDataElm = document.createElement('script');
            staticDataElm.setAttribute('data-stencil-static', 'page.state');
            staticDataElm.setAttribute('type', 'application/json');
            document.body.appendChild(staticDataElm);
        }
        staticDataElm.textContent = toString();
    });
    return data;
};
const createProxiedStaticData = (inputData) => {
    // server-side only
    const staticData = { root: null };
    const getterProxy = (obj, propName, propValue) => {
        const valueType = typeof propValue;
        if (propValue == null || valueType === 'string' || valueType === 'number' || valueType === 'boolean') {
            return (obj[propName] = propValue);
        }
        if (valueType === 'function') {
            return (obj[propName] = Object.create(null));
        }
        if (Array.isArray(propValue)) {
            const childArr = [];
            obj[propName] = childArr;
            return propValue.map((arrValue, arrIndex) => {
                return getterProxy(childArr, arrIndex, arrValue);
            });
        }
        if (valueType === 'object') {
            const childObj = (obj[propName] = obj[propName] || Object.create(null));
            return new Proxy(propValue, {
                get(target, key, receiver) {
                    const objValue = Reflect.get(target, key, receiver);
                    return getterProxy(childObj, key, objValue);
                },
            });
        }
        return propValue;
    };
    const proxiedData = getterProxy(staticData, 'root', inputData);
    return {
        data: proxiedData,
        toString: () => JSON.stringify(staticData.root),
    };
};

const stateHistory = new Map();
const staticState = (mapFn) => {
    if (Build.isServer) {
        // server side (async)
        return (params, url) => staticServerState(params, url, mapFn);
    }
    else {
        // client side (sync)
        return staticClientState;
    }
};
const staticServerState = (params, url, mapFn) => {
    // server-side only
    const inputData = mapFn(params, url);
    if (isPromise(inputData)) {
        return inputData.then(setDocumentStaticData).catch(err => {
            console.error(err);
            return setDocumentStaticData({});
        });
    }
    return setDocumentStaticData(inputData);
};
const staticClientState = (_params, url) => {
    // client side (sync)
    try {
        return getCachedState(url) || getDocumentState(url, document);
    }
    catch (e) {
        console.error(e);
    }
};
const getDocumentState = (url, doc) => {
    const staticElm = doc.querySelector('[data-stencil-static="page.state"]');
    let staticState;
    if (staticElm) {
        devDebug(`staticClientState: ${url.pathname} [parsed page.state]`);
        staticState = JSON.parse(staticElm.textContent);
        staticElm.remove();
    }
    else {
        devDebug(`staticClientState: ${url.pathname} [page.state not found]`);
    }
    return setCachedState(url, staticState);
};
const getCachedState = (url) => stateHistory.get(normalizePathname(url));
const hasCachedState = (url) => stateHistory.has(normalizePathname(url));
const setCachedState = (url, stateData) => stateHistory.set(normalizePathname(url), stateData);
const createWindowStaticRouter = (win, doc, loc, hstry, opts) => {
    const buildId = doc.documentElement.dataset.stencilBuild;
    const getDataFetchPath = (url) => `${url.pathname.endsWith('/') ? url.pathname : url.pathname + '/'}page.state.json?s-cache=${buildId}`;
    const loadStaticState = async (pushToUrl) => {
        try {
            if (win.fetch) {
                if (normalizePathname(pushToUrl) === normalizePathname(location)) {
                    devDebug(`beforePush: ${pushToUrl.pathname} [no pathname change]`);
                    return true;
                }
                if (hasCachedState(pushToUrl)) {
                    // already have static state ready to go
                    devDebug(`beforePush: ${pushToUrl.pathname} [cached state]`);
                    return true;
                }
                // try fetching for the static state
                const fetchUrl = getDataFetchPath(pushToUrl);
                const res = await win.fetch(fetchUrl, {
                    cache: 'force-cache',
                });
                if (res.ok) {
                    // awesome, we got a good response for page state data
                    const staticData = await res.json();
                    if (staticData.components) {
                        // page state is all the known components already
                        // let's preload them all before navigating
                        // await preloadComponents({ tags: staticData.components });
                    }
                    // cache the page state, which could be undefined, but that's valuable too
                    setCachedState(pushToUrl, staticData['page.state']);
                    devDebug(`beforePush: ${pushToUrl.pathname} [fetched state]`);
                    // stop so we don't trigger the location.href
                    return true;
                }
                else {
                    devDebug(`beforePush: ${pushToUrl.pathname} [fetched failed ${res.status}]`);
                }
            }
        }
        catch (e) {
            devDebug(`beforePush: ${pushToUrl.pathname}, ${e}`);
        }
        return false;
    };
    const beforePush = async (pushToUrl) => {
        const success = await loadStaticState(pushToUrl);
        if (!success) {
            // something errored, fallback to a normal page navigation
            loc.href = pushToUrl.pathname;
        }
    };
    const onHrefRender = (navigatedToUrl, currentUrl) => {
        // let's add a <link rel="prefetch"> for links found on this page
        // if the page we're navigating to is different than the current page
        // and we haven't cached it already
        // and there isn't already a <link> in the document.head for this url
        if (normalizePathname(navigatedToUrl) !== normalizePathname(currentUrl) &&
            !getCachedState(navigatedToUrl) &&
            !doc.head.querySelector(`link[href="${getDataFetchPath(navigatedToUrl)}"]`)) {
            const linkElm = doc.createElement('link');
            linkElm.setAttribute('rel', 'prefetch');
            linkElm.setAttribute('href', getDataFetchPath(navigatedToUrl));
            linkElm.setAttribute('as', 'fetch');
            doc.head.appendChild(linkElm);
        }
    };
    const reloadOnPopState = () => {
        const hasState = hasCachedState(loc);
        devDebug(`reloadOnPopState: ${loc.pathname} [hasStateCache: ${hasState}]`);
        return !hasState;
    };
    if (Build.isServer) {
        const styleElm = doc.createElement('style');
        styleElm.innerHTML = `.stencil-router-queue{display:none!important}`;
        doc.head.appendChild(styleElm);
    }
    if (Build.isBrowser) {
        if (!buildId) {
            console.warn(`Stencil Router: html document has not been prerendered, falling back to non-static router`);
            return createWindowRouter(win, doc, loc, hstry, opts);
        }
        getDocumentState(loc, doc);
    }
    return createWindowRouter(win, doc, loc, hstry, {
        beforePush,
        onHrefRender,
        reloadOnPopState,
        ...opts,
    });
};
const createStaticRouter = (opts = {}) => createWindowStaticRouter(window, document, location, history, opts).router;

/**
 * TS adaption of https://github.com/pillarjs/path-to-regexp/blob/master/index.js
 */
/**
 * Default configs.
 */
const DEFAULT_DELIMITER = '/';
const DEFAULT_DELIMITERS = './';
/**
 * The main path matching regexp utility.
 */
const PATH_REGEXP = new RegExp([
    // Match escaped characters that would otherwise appear in future matches.
    // This allows the user to escape special characters that won't transform.
    '(\\\\.)',
    // Match Express-style parameters and un-named parameters with a prefix
    // and optional suffixes. Matches appear as:
    //
    // "/:test(\\d+)?" => ["/", "test", "\d+", undefined, "?"]
    // "/route(\\d+)"  => [undefined, undefined, undefined, "\d+", undefined]
    '(?:\\:(\\w+)(?:\\(((?:\\\\.|[^\\\\()])+)\\))?|\\(((?:\\\\.|[^\\\\()])+)\\))([+*?])?',
].join('|'), 'g');
/**
 * Parse a string for the raw tokens.
 */
const parse = (str, options) => {
    const tokens = [];
    const defaultDelimiter = (options && options.delimiter) || DEFAULT_DELIMITER;
    const delimiters = (options && options.delimiters) || DEFAULT_DELIMITERS;
    let key = 0;
    let index = 0;
    let path = '';
    let pathEscaped = false;
    let res;
    while ((res = PATH_REGEXP.exec(str)) !== null) {
        const m = res[0];
        const escaped = res[1];
        const offset = res.index;
        path += str.slice(index, offset);
        index = offset + m.length;
        // Ignore already escaped sequences.
        if (escaped) {
            path += escaped[1];
            pathEscaped = true;
            continue;
        }
        let prev = '';
        const next = str[index];
        const name = res[2];
        const capture = res[3];
        const group = res[4];
        const modifier = res[5];
        if (!pathEscaped && path.length) {
            const k = path.length - 1;
            if (delimiters.indexOf(path[k]) > -1) {
                prev = path[k];
                path = path.slice(0, k);
            }
        }
        // Push the current path onto the tokens.
        if (path) {
            tokens.push(path);
            path = '';
            pathEscaped = false;
        }
        const partial = prev !== '' && next !== undefined && next !== prev;
        const repeat = modifier === '+' || modifier === '*';
        const optional = modifier === '?' || modifier === '*';
        const delimiter = prev || defaultDelimiter;
        const pattern = capture || group;
        tokens.push({
            name: name || key++,
            prefix: prev,
            delimiter: delimiter,
            optional: optional,
            repeat: repeat,
            partial: partial,
            pattern: pattern ? escapeGroup(pattern) : '[^' + escapeString(delimiter) + ']+?',
        });
    }
    // Push any remaining characters.
    if (path || index < str.length) {
        tokens.push(path + str.substr(index));
    }
    return tokens;
};
/**
 * Escape a regular expression string.
 */
const escapeString = (str) => str.replace(/([.+*?=^!:${}()[\]|/\\])/g, '\\$1');
/**
 * Escape the capturing group by escaping special characters and meaning.
 */
const escapeGroup = (group) => group.replace(/([=!:$/()])/g, '\\$1');
/**
 * Get the flags for a regexp from the options.
 */
const flags = (options) => (options && options.sensitive ? '' : 'i');
/**
 * Pull out keys from a regexp.
 */
const regexpToRegexp = (path, keys) => {
    if (keys) {
        // Use a negative lookahead to match only capturing groups.
        const groups = path.source.match(/\((?!\?)/g);
        if (groups) {
            for (let i = 0; i < groups.length; i++) {
                keys.push({
                    name: i,
                    prefix: null,
                    delimiter: null,
                    optional: false,
                    repeat: false,
                    partial: false,
                    pattern: null,
                });
            }
        }
    }
    return path;
};
/**
 * Transform an array into a regexp.
 */
const arrayToRegexp = (path, keys, options) => {
    const parts = [];
    for (let i = 0; i < path.length; i++) {
        parts.push(pathToRegexp(path[i], keys, options).source);
    }
    return new RegExp('(?:' + parts.join('|') + ')', flags(options));
};
/**
 * Create a path regexp from string input.
 */
const stringToRegexp = (path, keys, options) => tokensToRegExp(parse(path, options), keys, options);
/**
 * Expose a function for taking tokens and returning a RegExp.
 */
const tokensToRegExp = (tokens, keys, options) => {
    options = options || {};
    const strict = options.strict;
    const end = options.end !== false;
    const delimiter = escapeString(options.delimiter || DEFAULT_DELIMITER);
    const delimiters = options.delimiters || DEFAULT_DELIMITERS;
    const endsWith = []
        .concat(options.endsWith || [])
        .map(escapeString)
        .concat('$')
        .join('|');
    let route = '';
    let isEndDelimited = false;
    // Iterate over the tokens and create our regexp string.
    for (let i = 0; i < tokens.length; i++) {
        let token = tokens[i];
        if (typeof token === 'string') {
            route += escapeString(token);
            isEndDelimited = i === tokens.length - 1 && delimiters.indexOf(token[token.length - 1]) > -1;
        }
        else {
            const prefix = escapeString(token.prefix || '');
            const capture = token.repeat ? '(?:' + token.pattern + ')(?:' + prefix + '(?:' + token.pattern + '))*' : token.pattern;
            if (keys)
                keys.push(token);
            if (token.optional) {
                if (token.partial) {
                    route += prefix + '(' + capture + ')?';
                }
                else {
                    route += '(?:' + prefix + '(' + capture + '))?';
                }
            }
            else {
                route += prefix + '(' + capture + ')';
            }
        }
    }
    if (end) {
        if (!strict)
            route += '(?:' + delimiter + ')?';
        route += endsWith === '$' ? '$' : '(?=' + endsWith + ')';
    }
    else {
        if (!strict)
            route += '(?:' + delimiter + '(?=' + endsWith + '))?';
        if (!isEndDelimited)
            route += '(?=' + delimiter + '|' + endsWith + ')';
    }
    return new RegExp('^' + route, flags(options));
};
/**
 * Normalize the given path string, returning a regular expression.
 *
 * An empty array can be passed in for the keys, which will hold the
 * placeholder key descriptions. For example, using `/user/:id`, `keys` will
 * contain `[{ name: 'id', delimiter: '/', optional: false, repeat: false }]`.
 */
const pathToRegexp = (path, keys, options) => {
    if (path instanceof RegExp) {
        return regexpToRegexp(path, keys);
    }
    else if (Array.isArray(path)) {
        return arrayToRegexp(path, keys, options);
    }
    else {
        return stringToRegexp(path, keys, options);
    }
};

let cacheCount = 0;
const patternCache = {};
const cacheLimit = 10000;
// Memoized function for creating the path match regex
const compilePath = (pattern, options) => {
    const cacheKey = `${options.end}${options.strict}`;
    const cache = patternCache[cacheKey] || (patternCache[cacheKey] = {});
    const cachePattern = JSON.stringify(pattern);
    if (cache[cachePattern]) {
        return cache[cachePattern];
    }
    const keys = [];
    const re = pathToRegexp(pattern, keys, options);
    const compiledPattern = { re, keys };
    if (cacheCount < cacheLimit) {
        cache[cachePattern] = compiledPattern;
        cacheCount += 1;
    }
    return compiledPattern;
};
const match = (pathname, options = {}) => {
    const { exact = false, strict = false } = options;
    const { re, keys } = compilePath(pathname, { end: exact, strict });
    return (path) => {
        const match = re.exec(path);
        if (!match) {
            return undefined;
        }
        const [url, ...values] = match;
        if (exact && path !== url) {
            return undefined;
        }
        return keys.reduce((memo, key, index) => {
            memo[key.name] = values[index];
            return memo;
        }, {});
    };
};
const matchAny = (pathnames, options = {}) => {
    const matchFns = pathnames.map(pathname => match(pathname, options));
    return (path) => {
        let result;
        for (const matchFn of matchFns) {
            result = matchFn(path);
            if (result) {
                break;
            }
        }
        return result;
    };
};

export { NotFound, Route, createRouter, createStaticRouter, href, match, matchAny, staticState };
