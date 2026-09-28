import React, {
  forwardRef,
  useCallback,
  useRef,
  useEffect,
  useState,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Image,
  ActivityIndicator,
} from "react-native";
import { WebView } from "react-native-webview";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../contexts/ThemeContext";

// ─── Constants ────────────────────────────────────────────────────────────────

const DAPP_CONNECTIONS_KEY = "@dapp_connections";
const PAGE_CACHE_KEY = "@browser_page_cache";

const LOAD_TIMEOUT_MS = 20_000;
const REQUEST_TIMEOUT_MS = 30_000;
const CONNECTION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Pages visited within this window are served from disk cache first
const PAGE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PAGE_CACHE_MAX = 60; // max tracked URLs

const BROWSER_UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36";

const MM_SCHEMES =
  /^(metamask:\/\/|https:\/\/metamask\.app\.link\/|dapp:\/\/)/i;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getDomain = (url) => {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
};

const hexChainId = (id) => `0x${Number(id).toString(16)}`;

// Strip hash + trailing slash so the same page always maps to one key
const normaliseUrl = (url = "") => url.split("#")[0].replace(/\/$/, "");

const parseMetaMaskDeepLink = (url) => {
  try {
    const p = new URL(url);
    const params = Object.fromEntries(p.searchParams.entries());
    let originatorInfo = {};
    if (params.originatorInfo) {
      try {
        originatorInfo = JSON.parse(atob(params.originatorInfo));
      } catch {}
    }
    return {
      channelId: params.channelId ?? null,
      pubkey: params.pubkey ?? null,
      comm: params.comm ?? "socket",
      v: params.v ?? "2",
      originatorInfo,
    };
  } catch {
    return null;
  }
};

// ─── Page cache store ─────────────────────────────────────────────────────────
//
// Maintains a lightweight { url → { timestamp, title, domain } } map in
// AsyncStorage so we can pick the right WebView cacheMode per navigation:
//
//   LOAD_CACHE_ONLY          back / forward tap  → purely in-memory, no network
//   LOAD_CACHE_ELSE_NETWORK  revisit < 24 h ago  → disk cache first, fallback network
//   LOAD_DEFAULT             first visit / stale → normal network + cache headers
//
const PageCache = {
  _map: null, // in-memory mirror; null means not yet loaded

  async _hydrate() {
    if (this._map) return;
    try {
      const raw = await AsyncStorage.getItem(PAGE_CACHE_KEY);
      this._map = raw ? JSON.parse(raw) : {};
    } catch {
      this._map = {};
    }
  },

  async _persist() {
    try {
      // Evict oldest entries beyond the cap before writing
      const entries = Object.entries(this._map);
      if (entries.length > PAGE_CACHE_MAX) {
        entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
        this._map = Object.fromEntries(entries.slice(0, PAGE_CACHE_MAX));
      }
      await AsyncStorage.setItem(PAGE_CACHE_KEY, JSON.stringify(this._map));
    } catch {}
  },

  async record(url, title = "") {
    await this._hydrate();
    this._map[normaliseUrl(url)] = {
      timestamp: Date.now(),
      title,
      domain: getDomain(url),
    };
    this._persist(); // fire-and-forget
  },

  async getCacheMode(url, isBackForward = false) {
    if (isBackForward) return "LOAD_CACHE_ONLY";
    await this._hydrate();
    const entry = this._map[normaliseUrl(url)];
    if (!entry) return "LOAD_DEFAULT";
    return Date.now() - entry.timestamp < PAGE_CACHE_TTL_MS
      ? "LOAD_CACHE_ELSE_NETWORK"
      : "LOAD_DEFAULT";
  },

  async getRecent(limit = 20) {
    await this._hydrate();
    return Object.values(this._map)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  },

  async clear() {
    this._map = {};
    try {
      await AsyncStorage.removeItem(PAGE_CACHE_KEY);
    } catch {}
  },
};

// ─── Connection store ─────────────────────────────────────────────────────────

const ConnectionStore = {
  async load(domain, walletAddress) {
    try {
      const raw = await AsyncStorage.getItem(DAPP_CONNECTIONS_KEY);
      return (raw ? JSON.parse(raw) : {})[`${domain}_${walletAddress}`] ?? null;
    } catch {
      return null;
    }
  },
  async save(domain, walletAddress, chainId, chainSymbol) {
    try {
      const raw = await AsyncStorage.getItem(DAPP_CONNECTIONS_KEY);
      const map = raw ? JSON.parse(raw) : {};
      map[`${domain}_${walletAddress}`] = {
        domain,
        address: walletAddress,
        chainId,
        chainSymbol,
        timestamp: Date.now(),
      };
      await AsyncStorage.setItem(DAPP_CONNECTIONS_KEY, JSON.stringify(map));
    } catch {}
  },
  async remove(domain, walletAddress) {
    try {
      const raw = await AsyncStorage.getItem(DAPP_CONNECTIONS_KEY);
      if (!raw) return;
      const map = JSON.parse(raw);
      delete map[`${domain}_${walletAddress}`];
      await AsyncStorage.setItem(DAPP_CONNECTIONS_KEY, JSON.stringify(map));
    } catch {}
  },
};

// ─── Scripts ──────────────────────────────────────────────────────────────────

const ANTI_BOT_SCRIPT = `
(function () {
  try { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); } catch {}

  try {
    const plugins = [
      { name: 'Chrome PDF Plugin',  filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'Chrome PDF Viewer',  filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
      { name: 'Native Client',      filename: 'internal-nacl-plugin', description: '' },
    ];
    plugins.item = i => plugins[i];
    plugins.namedItem = n => plugins.find(p => p.name === n) ?? null;
    plugins.refresh = () => {};
    Object.defineProperty(navigator, 'plugins', { get: () => plugins });
  } catch {}

  try {
    const mimes = [
      { type: 'application/pdf', description: 'Portable Document Format', suffixes: 'pdf' },
      { type: 'application/x-google-chrome-pdf', description: 'Portable Document Format', suffixes: 'pdf' },
    ];
    mimes.item = i => mimes[i];
    mimes.namedItem = t => mimes.find(m => m.type === t) ?? null;
    Object.defineProperty(navigator, 'mimeTypes', { get: () => mimes });
  } catch {}

  const nav = {
    languages: ['en-US', 'en'], platform: 'Linux armv8l',
    vendor: 'Google Inc.', vendorSub: '', productSub: '20030107',
    hardwareConcurrency: 4, deviceMemory: 4, maxTouchPoints: 5,
  };
  Object.entries(nav).forEach(([k, v]) => {
    try { Object.defineProperty(navigator, k, { get: () => v }); } catch {}
  });

  const _pq = navigator.permissions?.query?.bind(navigator.permissions);
  if (_pq) {
    navigator.permissions.query = params =>
      params.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission, onchange: null })
        : _pq(params);
  }

  window.chrome ??= { runtime: {}, loadTimes: () => ({}), csi: () => ({}), app: {} };

  try {
    const _gp = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (param) {
      if (param === 37445) return 'Intel Inc.';
      if (param === 37446) return 'Intel Iris OpenGL Engine';
      return _gp.call(this, param);
    };
  } catch {}

  // Cloudflare challenge detection via document.title mutation
  const _title = Object.getOwnPropertyDescriptor(Document.prototype, 'title');
  Object.defineProperty(document, 'title', {
    get() { return _title.get.call(this); },
    set(v) {
      _title.set.call(this, v);
      if (/just a moment|checking your browser|ddos-guard|cloudflare/i.test(v)) {
        window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'CLOUDFLARE_CHALLENGE' }));
      }
    },
    configurable: true,
  });

  // Send page title back to RN once DOM is ready so we can store it in cache
  const sendTitle = () => {
    if (document.title) {
      window.ReactNativeWebView?.postMessage(
        JSON.stringify({ type: 'PAGE_TITLE', title: document.title })
      );
    }
  };
  document.addEventListener('DOMContentLoaded', sendTitle, { once: true });
  // Fallback for SPAs that set title after load
  new MutationObserver(sendTitle).observe(
    document.documentElement,
    { subtree: true, characterData: true, childList: true }
  );
})();
true;
`;

const DETECT_CHAIN_SCRIPT = `
(function () {
  const id =
    window.ethereum?.chainId ||
    window.__RUNTIME_CONFIG__?.chainId ||
    (window.__wagmiConfig?.chains?.[0]?.id
      ? '0x' + window.__wagmiConfig.chains[0].id.toString(16)
      : null);
  if (id) window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'CHAIN_DETECTED', chainId: id }));
})();
true;
`;

const buildWeb3Script = (walletAddress, chainId, connected) => `
(function () {
  let _connected = ${connected};
  let _accounts  = _connected ? ["${walletAddress}"] : [];
  let _chainId   = "${hexChainId(chainId)}";
  let _reqId     = 0;
  const _pending = new Map();
  const _events  = { accountsChanged:[], chainChanged:[], connect:[], disconnect:[], message:[] };

  const emit = (ev, data) => _events[ev]?.forEach(fn => { try { fn(data); } catch {} });

  const provider = {
    isMetaMask: true, isMobile: true, isStatus: true, isTrust: false,
    _metamask: { isUnlocked: () => Promise.resolve(_connected) },
    isConnected:    () => _connected,
    selectedAddress: _connected ? "${walletAddress}" : null,
    chainId:         "${hexChainId(chainId)}",
    networkVersion:  "${chainId}",
    _state: { accounts: _accounts, isConnected: _connected, isUnlocked: _connected,
              initialized: true, isPermanentlyDisconnected: false },

    request: async ({ method, params = [] }) => {
      switch (method) {
        case 'eth_accounts':  return _connected ? _accounts : [];
        case 'eth_coinbase':  return _connected ? _accounts[0] : null;
        case 'eth_chainId':   return _chainId;
        case 'net_version':   return "${chainId}";
      }
      if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') {
        const req = params?.[0]?.chainId;
        if (req) window.ReactNativeWebView?.postMessage(
          JSON.stringify({ type: 'CHAIN_REQUESTED', chainId: req, method })
        );
      }
      return new Promise((resolve, reject) => {
        const id = _reqId++;
        _pending.set(id, { resolve, reject, method });
        window.ReactNativeWebView?.postMessage(
          JSON.stringify({ type: 'WEB3_REQUEST', id, method, params })
        );
        setTimeout(() => {
          if (!_pending.has(id)) return;
          _pending.delete(id);
          if (method === 'eth_requestAccounts') resolve(_accounts);
          else if (/sign/i.test(method)) reject({ code: 4001, message: 'User rejected request' });
          else reject(new Error('Request timed out'));
        }, ${REQUEST_TIMEOUT_MS});
      });
    },

    sendAsync(p, cb) {
      this.request({ method: p.method, params: p.params })
        .then(r  => cb(null, { jsonrpc: '2.0', id: p.id, result: r }))
        .catch(e => cb(e, null));
    },
    send(p, cb) {
      if (typeof p === 'string')  return this.request({ method: p, params: cb || [] });
      if (Array.isArray(p))       return Promise.all(p.map(x => this.request(x)));
      return this.sendAsync(p, cb);
    },
    enable() { return this.request({ method: 'eth_requestAccounts' }); },

    on(ev, fn) {
      (_events[ev] ??= []).push(fn);
      if (ev === 'connect' && _connected) setTimeout(() => fn({ chainId: _chainId }), 0);
      return this;
    },
    removeListener(ev, fn) {
      if (_events[ev]) _events[ev] = _events[ev].filter(h => h !== fn);
      return this;
    },
    removeAllListeners(ev) {
      if (ev) _events[ev] = []; else Object.keys(_events).forEach(k => (_events[k] = []));
      return this;
    },

    handleResponse(id, err, result) {
      const p = _pending.get(id); if (!p) return; _pending.delete(id);
      err ? p.reject(err) : p.resolve(result);
    },
    _handleAccountsChanged(accounts) {
      _accounts = accounts; this.selectedAddress = accounts[0] || null;
      emit('accountsChanged', accounts);
    },
    _handleChainChanged(id) {
      _chainId = id; this.chainId = id;
      this.networkVersion = String(parseInt(id, 16));
      emit('chainChanged', id);
    },
  };

  Object.defineProperty(window, 'ethereum', { get: () => provider, set: () => provider, configurable: false });
  window.web3 ??= { currentProvider: provider, eth: { defaultAccount: provider.selectedAddress } };
  window.handleWeb3Response = (id, err, r) => provider.handleResponse(id, err, r);

  const info = { uuid: 'built-in-wallet', name: 'MetaMask',
                 icon: 'data:image/svg+xml;base64,...', rdns: 'io.metamask' };
  const announce = () => window.dispatchEvent(
    new CustomEvent('eip6963:announceProvider', { detail: { info, provider } })
  );
  window.addEventListener('eip6963:requestProvider', announce);
  setTimeout(announce, 0);

  window.dispatchEvent(new Event('ethereum#initialized'));
  if (_connected) setTimeout(() => emit('connect', { chainId: _chainId }), 50);
  window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'WEB3_READY' }));
})();
true;
`;

const buildInjectionScript = (walletAddress, chainId, connected) =>
  ANTI_BOT_SCRIPT +
  (walletAddress && chainId
    ? buildWeb3Script(walletAddress, chainId, connected)
    : "");

// ─── DeepLink connection modal ────────────────────────────────────────────────

const DeepLinkModal = ({ request, onApprove, onReject, COLORS }) => {
  if (!request) return null;
  const { originatorInfo: o } = request;

  return (
    <Modal transparent animationType="slide" visible>
      <View style={dl.overlay}>
        <View
          style={[
            dl.sheet,
            { backgroundColor: COLORS.card, borderColor: COLORS.border },
          ]}
        >
          <View style={dl.header}>
            <View
              style={[
                dl.iconWrap,
                {
                  backgroundColor: COLORS.primaryMuted,
                  borderColor: COLORS.border,
                },
              ]}
            >
              {o?.icon ? (
                <Image source={{ uri: o.icon }} style={dl.icon} />
              ) : (
                <Ionicons
                  name="globe-outline"
                  size={26}
                  color={COLORS.primary}
                />
              )}
            </View>
            <Text style={[dl.siteName, { color: COLORS.text }]}>
              {o?.title || o?.url || "Unknown dApp"}
            </Text>
            {!!o?.url && (
              <Text style={[dl.siteUrl, { color: COLORS.textSecondary }]}>
                {o.url}
              </Text>
            )}
          </View>

          <View
            style={[
              dl.infoBox,
              { backgroundColor: COLORS.surface, borderColor: COLORS.border },
            ]}
          >
            <Ionicons
              name="wallet-outline"
              size={15}
              color={COLORS.primary}
              style={{ marginTop: 1 }}
            />
            <View style={{ flex: 1 }}>
              <Text style={[dl.infoTitle, { color: COLORS.text }]}>
                Wallet connection request
              </Text>
              <Text style={[dl.infoBody, { color: COLORS.textSecondary }]}>
                This dApp wants to connect via MetaMask mobile protocol.
                Approving shares your wallet address with this site.
              </Text>
            </View>
          </View>

          {(o?.source || o?.apiVersion) && (
            <View style={[dl.badge, { backgroundColor: COLORS.primaryMuted }]}>
              <Text style={[dl.badgeText, { color: COLORS.primaryDark }]}>
                {[
                  o.source && `via ${o.source}`,
                  o.apiVersion && `v${o.apiVersion}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </View>
          )}

          <View style={dl.actions}>
            <TouchableOpacity
              onPress={onReject}
              activeOpacity={0.8}
              style={[
                dl.btn,
                {
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  backgroundColor: COLORS.surface,
                },
              ]}
            >
              <Text style={[dl.btnText, { color: COLORS.textSecondary }]}>
                Reject
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onApprove}
              activeOpacity={0.8}
              style={[dl.btn, { backgroundColor: COLORS.primary }]}
            >
              <Text style={[dl.btnText, { color: COLORS.background }]}>
                Connect
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const dl = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    padding: 24,
    gap: 16,
  },
  header: { alignItems: "center", gap: 8 },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: { width: 40, height: 40, borderRadius: 10 },
  siteName: { fontSize: 17, fontWeight: "700", textAlign: "center" },
  siteUrl: { fontSize: 11, textAlign: "center", opacity: 0.7 },
  infoBox: {
    flexDirection: "row",
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  infoTitle: { fontSize: 13, fontWeight: "600", marginBottom: 3 },
  infoBody: { fontSize: 12, lineHeight: 18, opacity: 0.8 },
  badge: {
    alignSelf: "center",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  badgeText: { fontSize: 11, fontWeight: "600" },
  actions: { flexDirection: "row", gap: 10, marginTop: 4 },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { fontSize: 15, fontWeight: "700" },
});

// ─── Cloudflare challenge overlay ─────────────────────────────────────────────

const CloudflareOverlay = ({ visible, COLORS }) => {
  if (!visible) return null;
  return (
    <View style={[cfo.wrap, { backgroundColor: COLORS.background }]}>
      <ActivityIndicator size="large" color={COLORS.primary} />
      <Text style={[cfo.title, { color: COLORS.text }]}>
        Checking your browser…
      </Text>
      <Text style={[cfo.sub, { color: COLORS.textSecondary }]}>
        Completing security verification, please wait.
      </Text>
    </View>
  );
};

const cfo = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    zIndex: 10,
  },
  title: { fontSize: 16, fontWeight: "700" },
  sub: { fontSize: 13, opacity: 0.7, textAlign: "center", maxWidth: 260 },
});

// ─── Main component ───────────────────────────────────────────────────────────

const BrowserWebView = forwardRef(
  (
    {
      currentUrl,
      wallet,
      activeChain,
      isConnected,
      onNavigationStateChange,
      onMessage,
      onConnectionChange,
      onChainMismatchDetected,
      onPageCached, // optional: ({ url, title, domain }) → feed into BrowserHome "recently visited"
    },
    ref,
  ) => {
    const { COLORS } = useTheme();

    const loadTimerRef = useRef(null);
    const lastUrlRef = useRef(currentUrl);
    const currentDomainRef = useRef(null);
    const detectedChainIdRef = useRef(null);
    const isBackForwardRef = useRef(false); // flagged by parent before back/fwd nav

    const [cacheMode, setCacheMode] = useState("LOAD_DEFAULT");
    const [deepLinkRequest, setDeepLinkRequest] = useState(null);
    const [showCfOverlay, setShowCfOverlay] = useState(false);

    // ── Resolve the right cache mode whenever the target URL changes ──────────
    useEffect(() => {
      let cancelled = false;
      PageCache.getCacheMode(currentUrl, isBackForwardRef.current).then(
        (mode) => {
          if (!cancelled) setCacheMode(mode);
          isBackForwardRef.current = false; // consume the flag
        },
      );
      return () => {
        cancelled = true;
      };
    }, [currentUrl]);

    // ── Expose cache controls + existing helpers via ref ──────────────────────
    useEffect(() => {
      if (!ref?.current) return;

      // Called by BrowserHeader "Clear Cache" menu item
      ref.current.clearPageCache = () => PageCache.clear();

      // Feed BrowserHome "recently visited" rail from outside
      ref.current.getRecentPages = (n = 20) => PageCache.getRecent(n);

      // Must be called by parent BEFORE triggering goBack() / goForward()
      // so the next URL resolves to LOAD_CACHE_ONLY
      ref.current.markBackForwardNav = () => {
        isBackForwardRef.current = true;
      };

      ref.current.clearDappConnection = () => {
        if (currentDomainRef.current && wallet?.address)
          ConnectionStore.remove(currentDomainRef.current, wallet.address);
      };
      ref.current.getDetectedChainId = () => detectedChainIdRef.current;
    });

    // ── Connection persistence ────────────────────────────────────────────────

    useEffect(() => {
      const domain = getDomain(currentUrl);
      if (!domain || !wallet?.address) return;
      ConnectionStore.load(domain, wallet.address).then((saved) => {
        if (!saved) return;
        if (
          Date.now() - saved.timestamp < CONNECTION_TTL_MS &&
          saved.chainId === activeChain?.id
        )
          onConnectionChange?.(true, domain);
      });
    }, [currentUrl, wallet?.address]);

    useEffect(() => {
      if (isConnected && currentDomainRef.current && wallet?.address)
        ConnectionStore.save(
          currentDomainRef.current,
          wallet.address,
          activeChain?.id,
          activeChain?.symbol,
        );
    }, [isConnected, wallet?.address, activeChain?.id]);

    // ── Deep link handlers ────────────────────────────────────────────────────

    const handleDeepLinkApprove = useCallback(() => {
      if (!deepLinkRequest) return;
      const domain = deepLinkRequest.originatorInfo?.url
        ? getDomain(deepLinkRequest.originatorInfo.url)
        : currentDomainRef.current;
      onConnectionChange?.(true, domain);
      setDeepLinkRequest(null);
    }, [deepLinkRequest, onConnectionChange]);

    const handleDeepLinkReject = useCallback(
      () => setDeepLinkRequest(null),
      [],
    );

    // ── Navigation ────────────────────────────────────────────────────────────

    const handleNavigationStateChange = useCallback(
      (navState) => {
        clearTimeout(loadTimerRef.current);

        if (!navState.loading) {
          setShowCfOverlay(false);

          // Record the loaded page into the cache store
          PageCache.record(navState.url, navState.title || "");

          if (ref?.current)
            setTimeout(
              () => ref.current?.injectJavaScript(DETECT_CHAIN_SCRIPT),
              1_000,
            );
        } else {
          loadTimerRef.current = setTimeout(() => {
            if (ref?.current && navState.url === lastUrlRef.current)
              ref.current.reload();
          }, LOAD_TIMEOUT_MS);
        }

        currentDomainRef.current = getDomain(navState.url);
        lastUrlRef.current = navState.url;
        onNavigationStateChange?.(navState);
      },
      [onNavigationStateChange, ref],
    );

    // ── URL interception ──────────────────────────────────────────────────────

    const handleShouldStartLoad = useCallback(
      ({ url }) => {
        if (MM_SCHEMES.test(url)) {
          const parsed = parseMetaMaskDeepLink(url);
          setDeepLinkRequest(
            parsed ?? {
              channelId: null,
              pubkey: null,
              comm: null,
              v: null,
              originatorInfo: { title: getDomain(currentUrl), url: currentUrl },
            },
          );
          return false;
        }
        return true;
      },
      [currentUrl],
    );

    // ── Messages ──────────────────────────────────────────────────────────────

    const handleMessage = useCallback(
      (event) => {
        try {
          const data = JSON.parse(event.nativeEvent.data);
          switch (data.type) {
            // Update the cache entry with the real page title (SPAs resolve late)
            case "PAGE_TITLE":
              if (lastUrlRef.current && data.title) {
                PageCache.record(lastUrlRef.current, data.title);
                onPageCached?.({
                  url: lastUrlRef.current,
                  title: data.title,
                  domain: currentDomainRef.current,
                });
              }
              break;

            case "CLOUDFLARE_CHALLENGE":
              setShowCfOverlay(true);
              break;
            case "CLOUDFLARE_PASSED":
              setShowCfOverlay(false);
              break;

            case "CHAIN_DETECTED":
            case "CHAIN_REQUESTED": {
              detectedChainIdRef.current = data.chainId;
              const dec = parseInt(data.chainId, 16);
              if (dec !== activeChain?.id)
                onChainMismatchDetected?.(dec, data.chainId);
              break;
            }
            case "WEB3_REQUEST":
              if (data.requestedChainId)
                detectedChainIdRef.current = data.requestedChainId;
              break;
          }
        } catch {}
        onMessage?.(event);
      },
      [onMessage, activeChain?.id, onChainMismatchDetected, onPageCached],
    );

    // ── Render ────────────────────────────────────────────────────────────────

    return (
      <View style={styles.container}>
        <WebView
          ref={ref}
          source={{ uri: currentUrl }}
          style={[styles.webView, { backgroundColor: COLORS.background }]}
          injectedJavaScriptBeforeContentLoaded={buildInjectionScript(
            wallet?.address,
            activeChain?.id,
            isConnected,
          )}
          onMessage={handleMessage}
          onNavigationStateChange={handleNavigationStateChange}
          onShouldStartLoadWithRequest={handleShouldStartLoad}
          // ── Smart cache mode (resolved per URL above) ────────────────────
          // LOAD_DEFAULT             first visit / stale (>24 h)
          // LOAD_CACHE_ELSE_NETWORK  revisit within 24 h  — disk first, network fallback
          // LOAD_CACHE_ONLY          back / forward tap   — purely from disk, zero network
          cacheEnabled
          cacheMode={cacheMode}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          allowFileAccess
          allowUniversalAccessFromFileURLs
          mixedContentMode="always"
          thirdPartyCookiesEnabled
          sharedCookiesEnabled
          incognito={false}
          startInLoadingState
          renderLoading={() => null}
          userAgent={BROWSER_UA}
          onError={({ nativeEvent }) =>
            __DEV__ && console.warn("[WebView]", nativeEvent)
          }
          onHttpError={({ nativeEvent }) => {
            if (__DEV__)
              console.warn("[WebView] HTTP:", nativeEvent.statusCode);
            if ([403, 429, 503].includes(nativeEvent.statusCode))
              setShowCfOverlay(true);
          }}
          onLoadProgress={({ nativeEvent }) => {
            if (nativeEvent.progress >= 1) setShowCfOverlay(false);
          }}
        />

        <CloudflareOverlay visible={showCfOverlay} COLORS={COLORS} />

        <DeepLinkModal
          request={deepLinkRequest}
          onApprove={handleDeepLinkApprove}
          onReject={handleDeepLinkReject}
          COLORS={COLORS}
        />
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: { flex: 1 },
  webView: { flex: 1 },
});

export default BrowserWebView;
