import React, { forwardRef, useCallback, useRef, useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../../contexts/ThemeContext";

const DAPP_CONNECTIONS_KEY = "@dapp_connections";

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
    },
    ref,
  ) => {
    const { COLORS } = useTheme();
    const loadingTimeoutRef = useRef(null);
    const lastUrlRef = useRef(currentUrl);
    const currentDomainRef = useRef(null);
    const detectedChainIdRef = useRef(null);

    // Extract domain from URL
    const getDomain = (url) => {
      try {
        const urlObj = new URL(url);
        return urlObj.hostname;
      } catch {
        return null;
      }
    };

    // Load persisted connections on mount
    useEffect(() => {
      loadPersistedConnection();
    }, [currentUrl, wallet?.address]);

    // Save connection when it changes
    useEffect(() => {
      if (isConnected && currentDomainRef.current) {
        saveConnection(currentDomainRef.current);
      }
    }, [isConnected, wallet?.address, activeChain?.id]);

    const loadPersistedConnection = async () => {
      try {
        const domain = getDomain(currentUrl);
        if (!domain || !wallet?.address) return;

        const stored = await AsyncStorage.getItem(DAPP_CONNECTIONS_KEY);
        if (stored) {
          const connections = JSON.parse(stored);
          const key = `${domain}_${wallet.address}`;

          if (connections[key]) {
            const savedConnection = connections[key];
            // Auto-connect if chain matches and connection is recent (within 7 days)
            const isRecent =
              Date.now() - savedConnection.timestamp < 7 * 24 * 60 * 60 * 1000;

            if (isRecent && savedConnection.chainId === activeChain?.id) {
              console.log("[DApp] Auto-connecting to:", domain);
              onConnectionChange?.(true, domain);
            }
          }
        }
      } catch (error) {
        console.error("[DApp] Error loading persisted connection:", error);
      }
    };

    const saveConnection = async (domain) => {
      try {
        if (!domain || !wallet?.address) return;

        const stored = await AsyncStorage.getItem(DAPP_CONNECTIONS_KEY);
        const connections = stored ? JSON.parse(stored) : {};

        const key = `${domain}_${wallet.address}`;
        connections[key] = {
          domain,
          address: wallet.address,
          chainId: activeChain.id,
          chainSymbol: activeChain.symbol,
          timestamp: Date.now(),
        };

        await AsyncStorage.setItem(
          DAPP_CONNECTIONS_KEY,
          JSON.stringify(connections),
        );
        console.log("[DApp] Connection saved for:", domain);
      } catch (error) {
        console.error("[DApp] Error saving connection:", error);
      }
    };

    const removeConnection = async (domain) => {
      try {
        if (!domain || !wallet?.address) return;

        const stored = await AsyncStorage.getItem(DAPP_CONNECTIONS_KEY);
        if (stored) {
          const connections = JSON.parse(stored);
          const key = `${domain}_${wallet.address}`;
          delete connections[key];
          await AsyncStorage.setItem(
            DAPP_CONNECTIONS_KEY,
            JSON.stringify(connections),
          );
          console.log("[DApp] Connection removed for:", domain);
        }
      } catch (error) {
        console.error("[DApp] Error removing connection:", error);
      }
    };

    // Detect chain ID from dApp's window.ethereum or requests
    const detectChainIdScript = `
      (function() {
        // Try to detect requested chain from various sources
        let detectedChainId = null;
        
        // Method 1: Check if dApp has a preferred chain in config
        if (window.ethereum && window.ethereum.chainId) {
          detectedChainId = window.ethereum.chainId;
        }
        
        // Method 2: Check common dApp configuration patterns
        if (window.__RUNTIME_CONFIG__ && window.__RUNTIME_CONFIG__.chainId) {
          detectedChainId = window.__RUNTIME_CONFIG__.chainId;
        }
        
        // Method 3: Check for Wagmi/RainbowKit config
        if (window.__wagmiConfig && window.__wagmiConfig.chains) {
          const defaultChain = window.__wagmiConfig.chains[0];
          if (defaultChain && defaultChain.id) {
            detectedChainId = '0x' + defaultChain.id.toString(16);
          }
        }
        
        // Send detected chain to React Native
        if (detectedChainId) {
          window.ReactNativeWebView?.postMessage(JSON.stringify({
            type: 'CHAIN_DETECTED',
            chainId: detectedChainId
          }));
        }
      })();
      true;
    `;

    const getWeb3InjectionScript = () => {
      if (!wallet?.address || !activeChain) {
        return "";
      }

      const selectedAddress = isConnected ? `"${wallet.address}"` : "null";

      return `
      (function() {
        console.log('[Web3Bridge] Aggressive initialization starting...');
        
        // Prevent page from redirecting to external MetaMask
        const originalOpen = window.open;
        window.open = function(url, ...args) {
          if (url && (url.includes('metamask') || url.includes('deeplink'))) {
            console.log('[Web3Bridge] Blocked external MetaMask redirect:', url);
            return null;
          }
          return originalOpen.call(window, url, ...args);
        };

        // Block MetaMask deep links
        const originalSetTimeout = window.setTimeout;
        window.setTimeout = function(fn, delay, ...args) {
          if (typeof fn === 'string' && fn.includes('metamask')) {
            console.log('[Web3Bridge] Blocked MetaMask setTimeout redirect');
            return null;
          }
          return originalSetTimeout.call(window, fn, delay, ...args);
        };

        // Intercept location changes
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;
        
        history.pushState = function(state, title, url) {
          if (url && typeof url === 'string' && url.includes('metamask')) {
            console.log('[Web3Bridge] Blocked MetaMask navigation');
            return;
          }
          return originalPushState.apply(history, arguments);
        };
        
        history.replaceState = function(state, title, url) {
          if (url && typeof url === 'string' && url.includes('metamask')) {
            console.log('[Web3Bridge] Blocked MetaMask navigation');
            return;
          }
          return originalReplaceState.apply(history, arguments);
        };

        const pendingRequests = new Map();
        let requestId = 0;
        let isConnected = ${isConnected};
        let currentAccounts = isConnected ? [${selectedAddress}] : [];
        let requestedChainId = null;

        const eventHandlers = {
          accountsChanged: [],
          chainChanged: [],
          connect: [],
          disconnect: [],
          message: []
        };

        const emitEvent = (event, data) => {
          console.log('[Web3Bridge] Emitting event:', event, data);
          if (eventHandlers[event]) {
            eventHandlers[event].forEach(handler => {
              try {
                handler(data);
              } catch (e) {
                console.error('[Web3Bridge] Event handler error:', e);
              }
            });
          }
        };

        // Core ethereum provider
        const ethereumProvider = {
          isMetaMask: true,
          isMobile: true,
          isStatus: true,
          isTrust: false,
          _metamask: {
            isUnlocked: () => Promise.resolve(isConnected)
          },
          isConnected: () => isConnected,
          selectedAddress: isConnected ? ${selectedAddress} : null,
          chainId: "0x${activeChain.id.toString(16)}",
          networkVersion: "${activeChain.id}",
          _events: eventHandlers,
          _state: {
            accounts: currentAccounts,
            isConnected: isConnected,
            isUnlocked: isConnected,
            initialized: true,
            isPermanentlyDisconnected: false
          },
          
          request: async ({ method, params = [] }) => {
            console.log('[Web3] Request:', method, params);
            
            // Capture requested chain from wallet_addEthereumChain or wallet_switchEthereumChain
            if (method === 'wallet_addEthereumChain' || method === 'wallet_switchEthereumChain') {
              if (params[0] && params[0].chainId) {
                requestedChainId = params[0].chainId;
                console.log('[Web3] Detected requested chain:', requestedChainId);
                
                // Notify React Native about chain request
                window.ReactNativeWebView?.postMessage(JSON.stringify({
                  type: 'CHAIN_REQUESTED',
                  chainId: requestedChainId,
                  method: method
                }));
              }
            }
            
            // Handle some methods immediately for better performance
            switch(method) {
              case 'eth_accounts':
                return isConnected ? currentAccounts : [];
              
              case 'eth_chainId':
                return "0x${activeChain.id.toString(16)}";
              
              case 'net_version':
                return "${activeChain.id}";
              
              case 'eth_coinbase':
                return isConnected ? currentAccounts[0] : null;
              
              case 'wallet_switchEthereumChain':
              case 'wallet_addEthereumChain':
                // Let React Native handle chain switching
                console.log('[Web3] Chain switch/add requested:', params);
                break;
            }
            
            const id = requestId++;
            
            return new Promise((resolve, reject) => {
              pendingRequests.set(id, { resolve, reject, method });
              
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'WEB3_REQUEST',
                id,
                method,
                params,
                requestedChainId: requestedChainId
              }));
              
              setTimeout(() => {
                if (pendingRequests.has(id)) {
                  pendingRequests.delete(id);
                  console.warn('[Web3] Request timeout:', method);
                  
                  if (method === 'eth_requestAccounts') {
                    resolve(currentAccounts);
                  } else if (method === 'personal_sign' || method === 'eth_signTypedData_v4') {
                    reject({ code: 4001, message: 'User rejected request' });
                  } else {
                    reject(new Error('Request timeout'));
                  }
                }
              }, 30000);
            });
          },
          
          handleResponse: (id, error, result) => {
            const pending = pendingRequests.get(id);
            if (pending) {
              pendingRequests.delete(id);
              if (error) {
                pending.reject(error);
              } else {
                pending.resolve(result);
              }
            }
          },
          
          sendAsync: function(payload, callback) {
            console.log('[Web3] sendAsync:', payload.method);
            this.request({ method: payload.method, params: payload.params })
              .then(result => callback(null, { jsonrpc: '2.0', id: payload.id, result }))
              .catch(error => callback(error, null));
          },
          
          send: function(payload, callback) {
            if (typeof payload === 'string') {
              console.log('[Web3] send (method):', payload);
              return this.request({ method: payload, params: callback || [] });
            }
            if (Array.isArray(payload)) {
              console.log('[Web3] send (batch):', payload.length);
              return Promise.all(payload.map(p => 
                this.request({ method: p.method, params: p.params })
              ));
            }
            console.log('[Web3] send (payload):', payload.method);
            return this.sendAsync(payload, callback);
          },
          
          enable: async function() {
            console.log('[Web3] enable() called');
            return this.request({ method: 'eth_requestAccounts' });
          },
          
          on: function(event, callback) {
            console.log('[Web3] Event listener added:', event);
            if (!eventHandlers[event]) {
              eventHandlers[event] = [];
            }
            eventHandlers[event].push(callback);
            
            if (event === 'connect' && isConnected) {
              setTimeout(() => callback({ chainId: this.chainId }), 0);
            }
            
            return this;
          },
          
          removeListener: function(event, callback) {
            console.log('[Web3] Event listener removed:', event);
            if (eventHandlers[event]) {
              const index = eventHandlers[event].indexOf(callback);
              if (index > -1) {
                eventHandlers[event].splice(index, 1);
              }
            }
            return this;
          },

          removeAllListeners: function(event) {
            if (event && eventHandlers[event]) {
              eventHandlers[event] = [];
            } else if (!event) {
              Object.keys(eventHandlers).forEach(key => {
                eventHandlers[key] = [];
              });
            }
            return this;
          },

          _handleAccountsChanged: function(accounts) {
            currentAccounts = accounts;
            this.selectedAddress = accounts[0] || null;
            emitEvent('accountsChanged', accounts);
          },

          _handleChainChanged: function(chainId) {
            this.chainId = chainId;
            this.networkVersion = String(parseInt(chainId, 16));
            emitEvent('chainChanged', chainId);
          }
        };

        // Aggressively set ethereum provider
        Object.defineProperty(window, 'ethereum', {
          get: () => ethereumProvider,
          set: (val) => {
            console.log('[Web3Bridge] Blocked attempt to override ethereum provider');
            return ethereumProvider;
          },
          configurable: false
        });

        if (!window.web3) {
          window.web3 = {
            currentProvider: ethereumProvider,
            eth: {
              defaultAccount: ethereumProvider.selectedAddress
            }
          };
        }

        window.handleWeb3Response = (id, error, result) => {
          ethereumProvider.handleResponse(id, error, result);
        };

        window.dispatchEvent(new Event('ethereum#initialized'));
        
        if (isConnected) {
          setTimeout(() => {
            emitEvent('connect', { chainId: ethereumProvider.chainId });
            console.log('[Web3Bridge] Connected event emitted');
          }, 50);
        }

        const announceProvider = () => {
          window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
            detail: {
              info: {
                uuid: 'built-in-wallet',
                name: 'MetaMask',
                icon: 'data:image/svg+xml;base64,...',
                rdns: 'io.metamask'
              },
              provider: ethereumProvider
            }
          }));
        };

        window.addEventListener('eip6963:requestProvider', announceProvider);
        setTimeout(announceProvider, 0);
        
        console.log('[Web3Bridge] Provider aggressively initialized');
        console.log('[Web3Bridge] Connected:', isConnected);
        console.log('[Web3Bridge] Address:', ethereumProvider.selectedAddress);
        console.log('[Web3Bridge] Chain ID:', ethereumProvider.chainId);

        window.ReactNativeWebView?.postMessage(JSON.stringify({
          type: 'WEB3_READY'
        }));
      })();
      
      true;
    `;
    };

    const handleNavigationStateChange = useCallback(
      (navState) => {
        if (!navState.loading) {
          if (loadingTimeoutRef.current) {
            clearTimeout(loadingTimeoutRef.current);
            loadingTimeoutRef.current = null;
          }

          // Try to detect chain after page loads
          if (ref?.current) {
            setTimeout(() => {
              ref.current.injectJavaScript(detectChainIdScript);
            }, 1000);
          }
        } else {
          if (loadingTimeoutRef.current) {
            clearTimeout(loadingTimeoutRef.current);
          }

          loadingTimeoutRef.current = setTimeout(() => {
            console.warn("[WebView] Loading timeout detected");
            if (ref?.current && navState.url === lastUrlRef.current) {
              console.log("[WebView] Reloading stuck page");
              ref.current.reload();
            }
          }, 15000);
        }

        // Track current domain for connection persistence
        currentDomainRef.current = getDomain(navState.url);
        lastUrlRef.current = navState.url;
        onNavigationStateChange?.(navState);
      },
      [onNavigationStateChange, ref],
    );

    const handleMessage = useCallback(
      (event) => {
        try {
          const data = JSON.parse(event.nativeEvent.data);

          if (data.type === "WEB3_READY") {
            console.log("[WebView] Web3 provider ready");
          } else if (
            data.type === "CHAIN_DETECTED" ||
            data.type === "CHAIN_REQUESTED"
          ) {
            console.log("[WebView] Chain detected:", data.chainId);
            detectedChainIdRef.current = data.chainId;

            // Convert hex to decimal
            const chainId = parseInt(data.chainId, 16);

            // Notify parent about chain mismatch
            if (chainId !== activeChain?.id && onChainMismatchDetected) {
              onChainMismatchDetected(chainId, data.chainId);
            }
          } else if (data.type === "WEB3_REQUEST" && data.requestedChainId) {
            // Store requested chain from the request
            detectedChainIdRef.current = data.requestedChainId;
          }

          onMessage?.(event);
        } catch (error) {
          console.error("[WebView] Message parse error:", error);
          onMessage?.(event);
        }
      },
      [onMessage, activeChain, onChainMismatchDetected],
    );

    // Expose method to clear connection for current domain
    useEffect(() => {
      if (ref?.current) {
        ref.current.clearDappConnection = () => {
          if (currentDomainRef.current) {
            removeConnection(currentDomainRef.current);
          }
        };

        ref.current.getDetectedChainId = () => {
          return detectedChainIdRef.current;
        };
      }
    }, [ref]);

    const styles = createStyles(COLORS);

    return (
      <View style={styles.container}>
        <WebView
          ref={ref}
          source={{ uri: currentUrl }}
          style={styles.webView}
          onNavigationStateChange={handleNavigationStateChange}
          onMessage={handleMessage}
          injectedJavaScriptBeforeContentLoaded={getWeb3InjectionScript()}
          startInLoadingState={true}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          allowFileAccess={true}
          allowUniversalAccessFromFileURLs={true}
          mixedContentMode="always"
          thirdPartyCookiesEnabled={true}
          sharedCookiesEnabled={true}
          cacheEnabled={true}
          cacheMode="LOAD_DEFAULT"
          incognito={false}
          userAgent="Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.error("[WebView] Error:", nativeEvent);
          }}
          onHttpError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.error("[WebView] HTTP Error:", nativeEvent.statusCode);
          }}
          onLoadProgress={({ nativeEvent }) => {
            console.log("[WebView] Load progress:", nativeEvent.progress);
          }}
          renderLoading={() => null}
          onShouldStartLoadWithRequest={(request) => {
            if (
              request.url.includes("metamask.app.link") ||
              request.url.includes("metamask://") ||
              request.url.startsWith("dapp://")
            ) {
              console.log("[WebView] Blocked MetaMask redirect:", request.url);
              return false;
            }
            return true;
          }}
        />
      </View>
    );
  },
);

const createStyles = (COLORS) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    webView: {
      flex: 1,
      backgroundColor: COLORS.background,
    },
  });

export default BrowserWebView;
