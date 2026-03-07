import React, { useState, useRef, useEffect } from "react";
import { View, StyleSheet, BackHandler, Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../../contexts/ThemeContext";
import { useWallet } from "../../contexts/WalletContext";
import { useChain } from "../../contexts/ChainContext";
import BrowserHeader from "../../components/browser/BrowserHeader";
import BrowserHome from "../../components/browser/BrowserHome";
import BrowserWebView from "../../components/browser/BrowserWebView";
import ConnectionModal from "../../components/browser/ConnectionModal";
import PasscodeModal from "../../components/modal/PasscodeModal";
import ChainSwitcher from "../../components/wallet/ChainSwitcher";
import { Web3Provider } from "../../utils/web3/web3Provider";
import { DomainSecurityChecker } from "../../utils/security/DomainSecurityChecker";
import Alert from "../../utils/Alert";
import { Web3ErrorParser } from "../../utils/web3/Web3ErrorParser";

const DAPP_CONNECTIONS_KEY = "@dapp_connections";
const BROWSER_HISTORY_KEY = "@browser_history";

// Common chain IDs mapping
const CHAIN_NAMES = {
  1: "Ethereum Mainnet",
  5: "Goerli Testnet",
  11155111: "Sepolia Testnet",
  10: "Optimism",
  56: "BNB Smart Chain",
  137: "Polygon",
  8453: "Base",
  42161: "Arbitrum One",
  43114: "Avalanche C-Chain",
  250: "Fantom Opera",
  100: "Gnosis Chain",
  42220: "Celo",
  1284: "Moonbeam",
  1285: "Moonriver",
  25: "Cronos",
  288: "Boba Network",
  1088: "Metis Andromeda",
  4002: "Fantom Testnet",
  80001: "Polygon Mumbai",
  421613: "Arbitrum Goerli",
  59144: "Linea",
  534352: "Scroll",
  7777777: "Zora",
  324: "zkSync Era",
  1101: "Polygon zkEVM",
  5000: "Mantle",
  5001: "Mantle Testnet",
  169: "Manta Pacific",
  81457: "Blast",
  34443: "Mode",
  2222: "Kava EVM",
  1313161554: "Aurora",
  1313161555: "Aurora Testnet",
  204: "opBNB",
  42170: "Arbitrum Nova",
  314: "Filecoin",
  314159: "Filecoin Calibration",
  10200: "Gnosis Chiado",
  1442: "Polygon zkEVM Testnet",
};

const BrowserScreen = ({ navigation }) => {
  const { COLORS } = useTheme();
  const { wallet, createSignerForTransaction, provider, address } = useWallet();
  const { activeChain, switchChain, chains } = useChain();

  // Navigation state
  const [currentUrl, setCurrentUrl] = useState("");
  const [inputUrl, setInputUrl] = useState("");
  const [isHome, setIsHome] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Connection state
  const [connectedDomains, setConnectedDomains] = useState(new Map());
  const [pendingConnection, setPendingConnection] = useState(null);
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [detectedChainId, setDetectedChainId] = useState(null);

  // Transaction/Sign state
  const [showPasscodeModal, setShowPasscodeModal] = useState(false);
  const [pendingRequest, setPendingRequest] = useState(null);

  // Chain switcher
  const [isChainSwitcherVisible, setChainSwitcherVisible] = useState(false);

  const webViewRef = useRef(null);
  const web3ProviderRef = useRef(null);
  const securityCheckerRef = useRef(new DomainSecurityChecker());
  const currentDomainRef = useRef(null);

  // Helper function to get chain name from ID
  const getChainName = (chainId) => {
    // First check if chain exists in user's wallet
    const userChain = chains?.find((c) => c.id === chainId);
    if (userChain) return userChain.name;

    // Then check common chain names
    if (CHAIN_NAMES[chainId]) return CHAIN_NAMES[chainId];

    // Fallback to chain ID
    return `Chain ID ${chainId}`;
  };

  // Initialize Web3 Provider
  useEffect(() => {
    if (wallet && activeChain) {
      web3ProviderRef.current = new Web3Provider(
        wallet,
        activeChain,
        provider,
        sendResponseToWebView,
        handleShowPasscodeModal,
        handleChainSwitchRequest,
      );
    }
  }, [wallet, activeChain]);

  // Load persisted connections on mount
  useEffect(() => {
    if (wallet?.address && !isHome) {
      loadPersistedConnection();
    }
  }, [currentUrl, wallet?.address, isHome]);

  // Update connected domains when chain changes
  useEffect(() => {
    if (activeChain && !isHome) {
      const domain = extractDomain(currentUrl);
      if (domain && connectedDomains.has(domain)) {
        // Notify WebView about chain change
        notifyChainChange();
      }
    }
  }, [activeChain]);

  // Back handler
  useEffect(() => {
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      handleBackPress,
    );
    return () => backHandler.remove();
  }, [isHome, canGoBack]);

  const handleBackPress = () => {
    if (!isHome && canGoBack) {
      webViewRef.current?.goBack();
      return true;
    } else if (!isHome) {
      handleGoHome();
      return true;
    }
    return false;
  };

  const extractDomain = (url) => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return null;
    }
  };

  // Load persisted connection for current domain
  const loadPersistedConnection = async () => {
    try {
      const domain = extractDomain(currentUrl);
      if (!domain || !wallet?.address) return;

      const stored = await AsyncStorage.getItem(DAPP_CONNECTIONS_KEY);
      if (stored) {
        const connections = JSON.parse(stored);
        const key = `${domain}_${wallet.address}`;

        if (connections[key]) {
          const savedConnection = connections[key];
          // Auto-connect if connection is recent (within 7 days) and chain matches
          const isRecent =
            Date.now() - savedConnection.timestamp < 7 * 24 * 60 * 60 * 1000;

          if (isRecent && savedConnection.chainId === activeChain?.id) {
            console.log("[Browser] Auto-connecting to:", domain);
            setConnectedDomains((prev) => {
              const newMap = new Map(prev);
              newMap.set(domain, {
                chainId: activeChain.id,
                connectedAt: savedConnection.timestamp,
                permissions: ["eth_accounts"],
                persisted: true,
              });
              return newMap;
            });
          }
        }
      }
    } catch (error) {
      console.error("[Browser] Error loading persisted connection:", error);
    }
  };

  // Save connection to AsyncStorage
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
      console.log("[Browser] Connection saved for:", domain);
    } catch (error) {
      console.error("[Browser] Error saving connection:", error);
    }
  };

  // Remove connection from AsyncStorage
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
        console.log("[Browser] Connection removed for:", domain);
      }
    } catch (error) {
      console.error("[Browser] Error removing connection:", error);
    }
  };

  const handleNavigate = async (url) => {
    if (!wallet) {
      Alert.alert(
        "No Wallet",
        "Please create or import a wallet first to use the Web3 browser.",
        [{ text: "OK" }],
      );
      return;
    }

    const formattedUrl = url.startsWith("http") ? url : `https://${url}`;

    // Check domain security
    const domain = extractDomain(formattedUrl);
    if (domain) {
      const securityCheck =
        await securityCheckerRef.current.checkDomain(domain);

      if (securityCheck.isHighRisk) {
        Alert.alert(
          "⚠️ Security Warning",
          `This site has been flagged as potentially dangerous:\n\n${securityCheck.warnings.join("\n")}\n\nDo you want to proceed anyway?`,
          [
            { text: "Go Back", style: "cancel" },
            {
              text: "Proceed Anyway",
              style: "destructive",
              onPress: () => navigateToUrl(formattedUrl),
            },
          ],
        );
        return;
      }

      if (securityCheck.warnings.length > 0) {
        Alert.alert("⚠️ Caution", securityCheck.warnings.join("\n"), [
          { text: "Cancel", style: "cancel" },
          {
            text: "Continue",
            onPress: () => navigateToUrl(formattedUrl),
          },
        ]);
        return;
      }
    }

    navigateToUrl(formattedUrl);
  };

  const navigateToUrl = (url) => {
    setCurrentUrl(url);
    setInputUrl(url);
    setIsHome(false);
  };

  const handleGoHome = () => {
    setIsHome(true);
    setCurrentUrl("");
    setInputUrl("");
  };

  const handleUrlSubmit = () => {
    if (inputUrl.trim()) {
      handleNavigate(inputUrl.trim());
    }
  };

  const handleNavigationStateChange = (navState) => {
    setCanGoBack(navState.canGoBack);
    setCanGoForward(navState.canGoForward);
    setCurrentUrl(navState.url);
    setInputUrl(navState.url);
    setIsLoading(navState.loading);

    // Track current domain
    currentDomainRef.current = extractDomain(navState.url);
  };

  // Web3 Message Handler
  const handleWebViewMessage = async (event) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);

      if (message.type !== "WEB3_REQUEST") {
        return;
      }

      const { id, method, params, requestedChainId } = message;
      const domain = extractDomain(currentUrl);

      // Store requested chain if present
      if (requestedChainId) {
        const chainIdDecimal = parseInt(requestedChainId, 16);
        console.log("[Browser] Detected requested chain:", chainIdDecimal);
        setDetectedChainId(chainIdDecimal);
      }

      // Check if domain is connected
      if (method === "eth_requestAccounts") {
        if (!connectedDomains.has(domain)) {
          // Show connection modal
          const securityInfo =
            await securityCheckerRef.current.checkDomain(domain);
          setPendingConnection({
            id,
            domain,
            url: currentUrl,
            securityInfo,
            timestamp: Date.now(),
            requestedChainId:
              detectedChainId ||
              (requestedChainId ? parseInt(requestedChainId, 16) : null),
          });
          setShowConnectionModal(true);
          return;
        }
      } else if (method !== "eth_accounts" && !connectedDomains.has(domain)) {
        // Reject if not connected
        sendResponseToWebView(
          id,
          { message: "Not connected to this site" },
          null,
        );
        return;
      }

      // Handle the request
      if (web3ProviderRef.current) {
        await web3ProviderRef.current.handleRequest(id, method, params);
      }
    } catch (parseError) {
      console.error("[BrowserScreen] Parse error:", parseError);
    }
  };

  // Connection approval
  const handleApproveConnection = async () => {
    if (!pendingConnection) return;

    const { id, domain } = pendingConnection;

    setConnectedDomains((prev) => {
      const newMap = new Map(prev);
      newMap.set(domain, {
        chainId: activeChain.id,
        connectedAt: Date.now(),
        permissions: ["eth_accounts"],
      });
      return newMap;
    });

    // Save connection to AsyncStorage
    await saveConnection(domain);

    sendResponseToWebView(id, null, [wallet.address]);
    setShowConnectionModal(false);
    setPendingConnection(null);
  };

  const handleRejectConnection = () => {
    if (!pendingConnection) return;

    sendResponseToWebView(
      pendingConnection.id,
      { message: "User rejected connection" },
      null,
    );
    setShowConnectionModal(false);
    setPendingConnection(null);
  };

  // Disconnect from site
  const handleDisconnect = async () => {
    const domain = extractDomain(currentUrl);
    if (domain) {
      Alert.alert(
        "Disconnect Wallet",
        `Disconnect your wallet from ${domain}?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Disconnect",
            style: "destructive",
            onPress: async () => {
              setConnectedDomains((prev) => {
                const newMap = new Map(prev);
                newMap.delete(domain);
                return newMap;
              });

              // Remove from persistent storage
              await removeConnection(domain);

              // Reload page to clear connection
              webViewRef.current?.reload();
            },
          },
        ],
      );
    }
  };

  // Chain switch request from dApp
  const handleChainSwitchRequest = async (id, requestedChainId) => {
    const chainName = getChainName(requestedChainId);
    const targetChain = chains?.find((c) => c.id === requestedChainId);

    Alert.alert(
      "Switch Network",
      `This site is requesting to switch to ${chainName}.${targetChain ? "" : "\n\nThis network is not available in your wallet."}`,
      [
        {
          text: "Cancel",
          onPress: () => {
            sendResponseToWebView(
              id,
              { message: "User rejected network switch" },
              null,
            );
          },
          style: "cancel",
        },
        ...(targetChain
          ? [
              {
                text: "Switch Network",
                onPress: async () => {
                  try {
                    await switchChain(targetChain);
                    sendResponseToWebView(id, null, null);
                  } catch (error) {
                    sendResponseToWebView(id, { message: error.message }, null);
                  }
                },
              },
            ]
          : [
              {
                text: "View Chains",
                onPress: () => {
                  setChainSwitcherVisible(true);
                  sendResponseToWebView(
                    id,
                    { message: "Network not available" },
                    null,
                  );
                },
              },
            ]),
      ],
    );
  };

  // Show passcode modal for transactions/signing
  const handleShowPasscodeModal = (id, type, method, params) => {
    setPendingRequest({ id, type, method, params });
    setShowPasscodeModal(true);
  };

  // Handle passcode submission
  const handlePasscodeSubmit = async (passcode) => {
    if (!pendingRequest || !web3ProviderRef.current) return;

    try {
      const { id, type, method, params } = pendingRequest;

      const result = await web3ProviderRef.current.executePendingRequest(
        type,
        method,
        params,
        passcode,
        createSignerForTransaction,
      );

      sendResponseToWebView(id, null, result);
      setShowPasscodeModal(false);
      setPendingRequest(null);
    } catch (error) {
      console.error("[BrowserScreen] Error processing request:", error);
      Alert.alert("Error", error.message);

      if (pendingRequest) {
        sendResponseToWebView(
          pendingRequest.id,
          { message: error.message },
          null,
        );
      }

      setShowPasscodeModal(false);
      setPendingRequest(null);
    }
  };

  // Handle chain mismatch detection
  const handleChainMismatchDetected = (chainIdDecimal, chainIdHex) => {
    console.log(
      "[Browser] Chain mismatch detected:",
      chainIdDecimal,
      "current:",
      activeChain.id,
    );
    setDetectedChainId(chainIdDecimal);
  };

  // Send response to WebView
  const sendResponseToWebView = (id, error, result) => {
    const script = `
      window.handleWeb3Response(
        ${id},
        ${error ? JSON.stringify(error) : "null"},
        ${result !== null ? JSON.stringify(result) : "null"}
      );
      true;
    `;

    webViewRef.current?.injectJavaScript(script);
  };

  // Notify WebView of chain change
  const notifyChainChange = () => {
    const script = `
      if (window.ethereum) {
        window.ethereum.chainId = "0x${activeChain.id.toString(16)}";
        window.ethereum.networkVersion = "${activeChain.id}";
        
        // Emit chainChanged event
        if (window.ethereum._events && window.ethereum._events.chainChanged) {
          window.ethereum._events.chainChanged.forEach(cb => {
            try { cb("0x${activeChain.id.toString(16)}"); } catch(e) {}
          });
        }
      }
      true;
    `;

    webViewRef.current?.injectJavaScript(script);
  };

  const getCurrentDomainConnection = () => {
    const domain = extractDomain(currentUrl);
    return domain ? connectedDomains.get(domain) : null;
  };

  // Menu handlers
  const handleRefresh = () => {
    console.log("[Browser] Page refreshed");
  };

  const handleClose = () => {
    Alert.alert(
      "Close Browser",
      "Are you sure you want to close the browser?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Close",
          onPress: () => {
            handleGoHome();
          },
          style: "destructive",
        },
      ],
    );
  };

  const handleClearCache = () => {
    Alert.alert(
      "Clear Cache",
      "This will clear all cached data for the browser.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          onPress: () => {
            webViewRef.current?.reload();
            Alert.alert("Success", "Cache cleared");
          },
          style: "destructive",
        },
      ],
    );
  };

  const handleClearHistory = async () => {
    Alert.alert("Clear History", "This will clear your browsing history.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        onPress: async () => {
          try {
            await AsyncStorage.removeItem(BROWSER_HISTORY_KEY);
            Alert.alert("Success", "History cleared");
          } catch (error) {
            console.error("Error clearing history:", error);
            Alert.alert("Error", "Failed to clear history");
          }
        },
        style: "destructive",
      },
    ]);
  };

  const handleShareUrl = async () => {
    try {
      await Share.share({
        message: currentUrl,
        url: currentUrl,
      });
    } catch (error) {
      console.error("Error sharing:", error);
    }
  };

  const handleCopyUrl = async () => {
    try {
      await Clipboard.setStringAsync(currentUrl);
      Alert.alert("Success", "URL copied to clipboard");
    } catch (error) {
      console.error("Error copying:", error);
      Alert.alert("Error", "Failed to copy URL");
    }
  };

  const handleClearDappConnection = async () => {
    const domain = extractDomain(currentUrl);
    if (domain) {
      Alert.alert(
        "Clear Connection",
        `This will remove the saved connection for ${domain}. You'll need to reconnect next time.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Clear",
            style: "destructive",
            onPress: async () => {
              // Remove from state
              setConnectedDomains((prev) => {
                const newMap = new Map(prev);
                newMap.delete(domain);
                return newMap;
              });

              // Remove from AsyncStorage
              await removeConnection(domain);

              Alert.alert("Success", "Connection cleared");
            },
          },
        ],
      );
    }
  };

  const styles = createStyles(COLORS);

  return (
    <View style={styles.container}>
      {!isHome && (
        <BrowserHeader
          inputUrl={inputUrl}
          setInputUrl={setInputUrl}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          isLoading={isLoading}
          webViewRef={webViewRef}
          handleGoHome={handleGoHome}
          handleUrlSubmit={handleUrlSubmit}
          activeChain={activeChain}
          isConnected={!!getCurrentDomainConnection()}
          onChainPress={() => setChainSwitcherVisible(true)}
          onDisconnect={handleDisconnect}
          onRefresh={handleRefresh}
          onClose={handleClose}
          onClearCache={handleClearCache}
          onClearHistory={handleClearHistory}
          onShareUrl={handleShareUrl}
          onCopyUrl={handleCopyUrl}
          onClearDappConnection={handleClearDappConnection}
        />
      )}

      {isHome ? (
        <BrowserHome
          navigation={navigation}
          wallet={wallet}
          address={address}
          activeChain={activeChain}
          inputUrl={inputUrl}
          setInputUrl={setInputUrl}
          handleNavigate={handleNavigate}
          handleUrlSubmit={handleUrlSubmit}
          onChainPress={() => setChainSwitcherVisible(true)}
        />
      ) : (
        <BrowserWebView
          ref={webViewRef}
          currentUrl={currentUrl}
          wallet={wallet}
          activeChain={activeChain}
          isConnected={!!getCurrentDomainConnection()}
          onNavigationStateChange={handleNavigationStateChange}
          onMessage={handleWebViewMessage}
          onConnectionChange={(connected, domain) => {
            console.log(
              `[Browser] Connection ${connected ? "established" : "cleared"} for ${domain}`,
            );
          }}
          onChainMismatchDetected={handleChainMismatchDetected}
        />
      )}

      {/* Connection Modal */}
      <ConnectionModal
        visible={showConnectionModal}
        pendingConnection={pendingConnection}
        wallet={wallet}
        activeChain={activeChain}
        onApprove={handleApproveConnection}
        onReject={handleRejectConnection}
      />

      {/* Passcode Modal */}
      <PasscodeModal
        visible={showPasscodeModal}
        onClose={() => {
          setShowPasscodeModal(false);
          if (pendingRequest) {
            sendResponseToWebView(
              pendingRequest.id,
              { message: "User cancelled" },
              null,
            );
            setPendingRequest(null);
          }
        }}
        onSubmit={handlePasscodeSubmit}
        title="Confirm Action"
        subtitle="Enter your passcode to continue"
      />

      {/* Chain Switcher */}
      <ChainSwitcher
        visible={isChainSwitcherVisible}
        onClose={() => setChainSwitcherVisible(false)}
      />
    </View>
  );
};

const createStyles = (COLORS) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
    },
  });

export default BrowserScreen;
