import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Modal,
  FlatList,
  ActivityIndicator,
  Image,
  Animated,
} from "react-native";
import { useWallet } from "../../contexts/WalletContext";
import { useChain } from "../../contexts/ChainContext";
import { useTheme } from "../../contexts/ThemeContext";
import Button from "../../components/common/Button";
import Input from "../../components/common/Input";
import { Feather, Ionicons } from "@expo/vector-icons";
import QRScanner from "../../components/wallet/QRScanner";
import ChainSwitcher from "../../components/wallet/ChainSwitcher";
import { TransactionModal } from "../../components/TransactionModal";
import { validateAddress, validateAmount } from "../../utils/Validators";
import { formatAddress } from "../../utils/Wallet";
import { parseUnits } from "ethers";
import Alert from "../../utils/Alert";
import { getTokensByChain } from "../../utils/TokenDatabase";
import { API_CONFIG } from "../../config/api";
import ChainBadge from "../../components/common/ChainBadge";
import {
  getAllTokenBalances,
  getTokenBalance,
} from "../../utils/blockchain/Balances";
import {
  estimateNativeTransferGas,
  estimateTokenTransferGas,
} from "../../utils/blockchain/Gas";

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
];

const API_BASE_URL = API_CONFIG.BASE_URL;

const RECIPIENT_MODES = [
  { key: "address", label: "Address", icon: "hash" },
  { key: "username", label: "Username", icon: "at-sign" },
  { key: "email", label: "Email", icon: "mail" },
];

const resolveIdentity = async (emailOrUsername) => {
  const res = await fetch(
    `${API_BASE_URL}/wallets/resolve?email_or_username=${encodeURIComponent(emailOrUsername.trim())}`,
  );
  const json = await res.json();
  if (!res.ok) throw { status: res.status, ...json };
  return json;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build the native token entry from chain/wallet context — no async needed. */
const buildNativeToken = (activeChain, nativeBalance) => ({
  id: "native",
  symbol: activeChain.symbol,
  name: activeChain.name,
  address: null,
  balance: nativeBalance.formatted,
  decimals: 18,
  isNative: true,
  logo: activeChain.icon,
  source: "native",
  balanceLoading: false,
});

/** Shape a DB token row into the list format, optionally with a live balance. */
const formatDbToken = (dbToken, balance = "0", balanceLoading = false) => ({
  id: dbToken.address,
  symbol: dbToken.symbol,
  name: dbToken.name,
  address: dbToken.address,
  balance,
  decimals: dbToken.decimals,
  isNative: false,
  logo: dbToken.logo || null,
  source: "imported",
  balanceLoading,
});

/** Shape a discovered on-chain token, enriched with any DB metadata. */
const formatDiscoveredToken = (token, dbToken = null) => ({
  id: token.address,
  symbol: dbToken?.symbol || token.symbol,
  name: dbToken?.name || token.name,
  address: token.address,
  balance: token.formatted,
  decimals: dbToken?.decimals ?? token.decimals,
  isNative: false,
  logo: dbToken?.logo || token.logo || null,
  source: dbToken ? "imported" : "discovered",
  balanceLoading: false,
});

/** Merge a newly-fetched token list into existing state without flicker. */
const mergeTokenLists = (existing, incoming) => {
  const incomingMap = {};
  incoming.forEach((t) => {
    incomingMap[t.id] = t;
  });

  // Update existing entries that now have live balances
  const updated = existing.map((t) => incomingMap[t.id] ?? t);

  // Append truly new entries (discovered on-chain, not in DB)
  incoming.forEach((t) => {
    if (!updated.find((e) => e.id === t.id)) updated.push(t);
  });

  return updated.sort(
    (a, b) => (parseFloat(b.balance) || 0) - (parseFloat(a.balance) || 0),
  );
};

// ─────────────────────────────────────────────────────────────────────────────

const SendScreen = ({ navigation, route }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { address, getBalanceForChain, refreshAllBalances } = useWallet();
  const { activeChain } = useChain();
  const { token: routeToken, recipient: routeRecipient } = route.params || {};

  // ── Token state ────────────────────────────────────────────────────────────
  const [selectedToken, setSelectedToken] = useState(null);
  const [availableTokens, setAvailableTokens] = useState([]);
  // Two separate loading flags:
  //   loadingTokens  → true only during Phase 1 (blocks screen render)
  //   refreshingBalances → true during Phase 2 (background, shows subtle indicator)
  const [loadingTokens, setLoadingTokens] = useState(true);
  const [refreshingBalances, setRefreshingBalances] = useState(false);

  // ── Recipient state ────────────────────────────────────────────────────────
  const [recipientMode, setRecipientMode] = useState("address");
  const [recipient, setRecipient] = useState(routeRecipient ?? "");
  const [resolvedAddress, setResolvedAddress] = useState(null);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState(null);

  // ── Other state ────────────────────────────────────────────────────────────
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [gasEstimate, setGasEstimate] = useState(null);
  const [estimatingGas, setEstimatingGas] = useState(false);
  const [errors, setErrors] = useState({});

  // ── Modal states ───────────────────────────────────────────────────────────
  const [showTokenSelector, setShowTokenSelector] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showChainSwitcher, setShowChainSwitcher] = useState(false);
  const [showTransactionModal, setShowTransactionModal] = useState(false);

  // ── Resolve chip animation ─────────────────────────────────────────────────
  const resolveChipAnim = useRef(new Animated.Value(0)).current;

  // ── Computed ───────────────────────────────────────────────────────────────
  const effectiveRecipient =
    recipientMode === "address" ? recipient : resolvedAddress;

  // ─────────────────────────────────────────────────────────────────────────────
  // Token loading — two-phase to minimise perceived latency
  //
  // Phase 1 (synchronous / near-instant):
  //   • Build native token from WalletContext (no async).
  //   • Load user-imported tokens from the local SQLite DB (fast local I/O).
  //   • Render the screen immediately with balance = "0" placeholders for
  //     imported tokens while Phase 2 runs in the background.
  //
  // Phase 2 (background — no spinner blocking the UI):
  //   • Fetch on-chain balances via getAllTokenBalances (network call).
  //   • For DB tokens not discovered via logs, call getTokenBalance directly.
  //   • Merge results into the existing list — tokens already on screen just
  //     get their balance updated in place.
  // ─────────────────────────────────────────────────────────────────────────────
  const loadTokens = useCallback(async () => {
    if (!address || !activeChain) return;

    // ── Phase 1: instant render ───────────────────────────────────────────────
    const nativeBalance = getBalanceForChain(activeChain.id);
    const nativeToken = buildNativeToken(activeChain, nativeBalance);

    const userAddress = address.toLowerCase();
    const normalizedChainId = parseInt(activeChain.id);

    // Local DB only — fast
    const importedTokens = await getTokensByChain(
      userAddress,
      normalizedChainId,
    );

    // Show placeholders with balanceLoading flag so the UI can render a shimmer
    const phase1Tokens = [nativeToken, ...importedTokens.map((t) => formatDbToken(t, "0", true))];
    setAvailableTokens(phase1Tokens);
    setLoadingTokens(false); // ← screen renders here

    if (!selectedToken && !routeToken) setSelectedToken(nativeToken);

    // ── Phase 2: background balance fetch ────────────────────────────────────
    setRefreshingBalances(true);
    try {
      const [discoveredTokens] = await Promise.all([
        getAllTokenBalances(address, activeChain),
      ]);

      // Index for O(1) lookup
      const discoveredMap = {};
      discoveredTokens.forEach((t) => {
        discoveredMap[t.address.toLowerCase()] = t;
      });

      const dbMap = {};
      importedTokens.forEach((t) => {
        dbMap[t.address.toLowerCase()] = t;
      });

      // Shape discovered tokens (enriched with DB metadata where available)
      const discoveredFormatted = discoveredTokens.map((token) =>
        formatDiscoveredToken(
          token,
          dbMap[token.address.toLowerCase()] ?? null,
        ),
      );

      // For DB tokens not found via logs — fetch balance directly (parallel)
      const missingDbTokens = importedTokens.filter(
        (t) => !discoveredMap[t.address.toLowerCase()],
      );

      const directResults = await Promise.all(
        missingDbTokens.map(async (dbToken) => {
          try {
            const bal = await getTokenBalance(
              dbToken.address,
              address,
              activeChain,
            );
            return formatDbToken(dbToken, bal.formatted, false);
          } catch {
            // Unresponsive contract on this chain — show zero balance
            return formatDbToken(dbToken, "0", false);
          }
        }),
      );

      // Merge everything and update state once
      setAvailableTokens((prev) =>
        mergeTokenLists(prev, [...discoveredFormatted, ...directResults]),
      );
    } catch (error) {
      console.error("[SendScreen] Background balance refresh failed:", error);
      // Don't alert — Phase 1 tokens are still usable; just clear loading flags
      setAvailableTokens((prev) =>
        prev.map((t) => ({ ...t, balanceLoading: false })),
      );
    } finally {
      setRefreshingBalances(false);
    }
  }, [address, activeChain]);

  useEffect(() => {
    loadTokens();
  }, [loadTokens]);

  useEffect(() => {
    if (routeToken) setSelectedToken(routeToken);
  }, [routeToken]);

  // ── Debounced identity resolve ─────────────────────────────────────────────
  useEffect(() => {
    if (recipientMode === "address") return;

    if (!recipient.trim()) {
      setResolvedAddress(null);
      setResolveError(null);
      animateResolveChip(false);
      return;
    }

    setResolvedAddress(null);
    setResolveError(null);
    animateResolveChip(false);

    const timer = setTimeout(() => doResolve(recipient.trim()), 600);
    return () => clearTimeout(timer);
  }, [recipient, recipientMode]);

  // ── Debounced gas estimation ───────────────────────────────────────────────
  useEffect(() => {
    if (effectiveRecipient && amount && address && selectedToken) {
      const timer = setTimeout(() => estimateGas(), 500);
      return () => clearTimeout(timer);
    } else {
      setGasEstimate(null);
    }
  }, [effectiveRecipient, amount, selectedToken]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const animateResolveChip = (show) => {
    Animated.spring(resolveChipAnim, {
      toValue: show ? 1 : 0,
      useNativeDriver: true,
      tension: 60,
      friction: 10,
    }).start();
  };

  const doResolve = async (query) => {
    try {
      setResolving(true);
      const result = await resolveIdentity(query);
      const addr = result.data?.wallet_address;
      setResolvedAddress(addr);
      setResolveError(null);
      animateResolveChip(true);
    } catch (err) {
      setResolvedAddress(null);
      setResolveError(
        err.status === 404
          ? `No wallet found for "${query}"`
          : "Could not resolve identity. Try again.",
      );
      animateResolveChip(false);
    } finally {
      setResolving(false);
    }
  };

  const switchMode = (mode) => {
    setRecipientMode(mode);
    setRecipient("");
    setResolvedAddress(null);
    setResolveError(null);
    animateResolveChip(false);
    setGasEstimate(null);
    setErrors((prev) => ({ ...prev, recipient: null }));
  };

  const estimateGas = async () => {
    const dest = effectiveRecipient;
    if (!validateAddress(dest).isValid || !amount || parseFloat(amount) <= 0)
      return;

    try {
      setEstimatingGas(true);
      setErrors((prev) => ({ ...prev, gas: null }));

      const estimate = selectedToken?.isNative
        ? await estimateNativeTransferGas(address, dest, amount, activeChain)
        : await estimateTokenTransferGas(
            address,
            selectedToken.address,
            dest,
            amount,
            selectedToken.decimals,
            activeChain,
          );

      setGasEstimate(estimate);
    } catch (error) {
      console.error("Gas estimation error:", error);
      setErrors((prev) => ({
        ...prev,
        gas: "Unable to estimate gas. Please check the amount.",
      }));
    } finally {
      setEstimatingGas(false);
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!selectedToken) newErrors.token = "Please select a token";

    if (recipientMode !== "address") {
      if (!recipient.trim()) {
        newErrors.recipient =
          recipientMode === "username" ? "Enter a username" : "Enter an email";
      } else if (resolving) {
        newErrors.recipient = "Still resolving identity…";
      } else if (!resolvedAddress) {
        newErrors.recipient = resolveError || "Could not resolve this identity";
      }
    } else {
      const addressValidation = validateAddress(recipient);
      if (!addressValidation.isValid)
        newErrors.recipient = addressValidation.errors[0];
    }

    const amountValidation = validateAmount(
      amount,
      selectedToken?.balance || "0",
    );
    if (!amountValidation.isValid)
      newErrors.amount = amountValidation.errors[0];

    if (selectedToken?.isNative && gasEstimate) {
      const total = parseFloat(amount) + parseFloat(gasEstimate.totalCost);
      if (total > parseFloat(selectedToken.balance)) {
        newErrors.amount = "Insufficient balance including gas fee";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSend = () => {
    if (!validateForm()) return;
    setShowTransactionModal(true);
  };

  const handleTransactionSuccess = async () => {
    try {
      await refreshAllBalances();
      Alert.alert("Success", `Sent ${amount} ${selectedToken.symbol}`, [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch {
      Alert.alert("Transaction Sent", "Your transaction was successful.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    }
  };

  const handleTransactionError = (error) => {
    if (error?.type !== "cancelled") {
      Alert.alert(
        error?.title || "Transaction Failed",
        error?.message ||
          "An error occurred while processing your transaction.",
      );
    }
  };

  const setMaxAmount = () => {
    if (!selectedToken) return;
    if (selectedToken.isNative) {
      const max = gasEstimate
        ? Math.max(
            0,
            parseFloat(selectedToken.balance) -
              parseFloat(gasEstimate.totalCost) -
              0.000001,
          ).toFixed(6)
        : (parseFloat(selectedToken.balance) * 0.8).toFixed(6);
      setAmount(max);
    } else {
      setAmount(selectedToken.balance);
    }
  };

  const handleSelectToken = (token) => {
    setSelectedToken(token);
    setAmount("");
    setGasEstimate(null);
    setShowTokenSelector(false);
  };

  const handleQRScan = (scannedAddress) => {
    setRecipientMode("address");
    setRecipient(scannedAddress);
    setShowQRScanner(false);
  };

  const getTokenSourceBadge = (source) => {
    if (source === "imported")
      return { label: "Imported", color: theme.COLORS.primary };
    if (source === "discovered")
      return { label: "Found", color: theme.COLORS.success };
    return null;
  };

  const getTransactionConfig = () => {
    const dest = effectiveRecipient;
    if (!selectedToken || !dest || !amount) return null;

    if (selectedToken.isNative) {
      return {
        isNative: true,
        to: dest,
        value: parseUnits(amount, 18).toString(),
      };
    }
    return {
      isNative: false,
      contractAddress: selectedToken.address,
      contractABI: ERC20_ABI,
      functionName: "transfer",
      args: [dest, parseUnits(amount, selectedToken.decimals)],
      value: "0",
    };
  };

  const txConfig = getTransactionConfig();

  const recipientDisplayLabel =
    recipientMode === "address"
      ? formatAddress(recipient, 10)
      : `${recipient} (${formatAddress(resolvedAddress || "", 8)})`;

  // ── Render helpers ─────────────────────────────────────────────────────────

  const renderTokenItem = ({ item }) => {
    const balanceNum = parseFloat(item.balance);
    const sourceBadge = getTokenSourceBadge(item.source);

    return (
      <TouchableOpacity
        style={[
          styles.tokenItem,
          selectedToken?.id === item.id && styles.tokenItemSelected,
        ]}
        onPress={() => handleSelectToken(item)}
        activeOpacity={0.7}
      >
        <View style={styles.tokenItemLeft}>
          <View style={styles.tokenIconOuterWrap}>
            {item.logo ? (
              <Image source={{ uri: item.logo }} style={styles.tokenLogo} />
            ) : (
              <View
                style={[
                  styles.tokenIcon,
                  item.isNative && styles.tokenIconNative,
                ]}
              >
                <Text style={styles.tokenIconText}>
                  {item.symbol.substring(0, 2)}
                </Text>
              </View>
            )}
            {!item.isNative && (
              <ChainBadge
                uri={activeChain?.icon}
                borderColor={theme.COLORS.background}
              />
            )}
          </View>
          <View style={styles.tokenItemInfo}>
            <View style={styles.tokenItemHeader}>
              <Text style={styles.tokenItemSymbol}>{item.symbol}</Text>
              {sourceBadge && (
                <View
                  style={[
                    styles.sourceBadge,
                    { backgroundColor: sourceBadge.color + "20" },
                  ]}
                >
                  <Text
                    style={[
                      styles.sourceBadgeText,
                      { color: sourceBadge.color },
                    ]}
                  >
                    {sourceBadge.label}
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.tokenItemName}>{item.name}</Text>
          </View>
        </View>
        <View style={styles.tokenItemRight}>
          {item.balanceLoading ? (
            <ActivityIndicator size="small" color={theme.COLORS.primary} />
          ) : (
            <Text
              style={[
                styles.tokenItemBalance,
                balanceNum === 0 && styles.tokenItemBalanceZero,
              ]}
            >
              {balanceNum.toFixed(4)}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // ── Loading screen (Phase 1 only — should be very brief) ──────────────────
  if (loadingTokens) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.COLORS.primary} />
        <Text style={styles.loadingText}>Loading tokens...</Text>
      </View>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Send</Text>
          <View style={styles.headerRight}>
            {/* Subtle background-refresh indicator */}
            {refreshingBalances && (
              <ActivityIndicator
                size="small"
                color={theme.COLORS.textSecondary}
                style={styles.refreshIndicator}
              />
            )}
            <TouchableOpacity
              style={styles.networkButton}
              onPress={() => setShowChainSwitcher(true)}
              activeOpacity={0.7}
            >
              {activeChain.icon && (
                <Image
                  source={{ uri: activeChain.icon }}
                  style={styles.networkIcon}
                />
              )}
              <Text style={styles.networkText}>{activeChain.name}</Text>
              <Feather
                name="chevron-down"
                size={12}
                color={theme.COLORS.textSecondary}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Empty State ── */}
        {availableTokens.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons
              name="wallet-outline"
              size={48}
              color={theme.COLORS.textSecondary}
            />
            <Text style={styles.emptyText}>No tokens available</Text>
            <Text style={styles.emptySubtext}>Import tokens to send them</Text>
            <Button
              title="Import Token"
              onPress={() => navigation.navigate("TokenImport")}
              size="small"
              style={styles.emptyButton}
            />
          </View>
        )}

        {availableTokens.length > 0 && (
          <>
            {/* ── Token Selector ── */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionLabel}>Token</Text>
                <Text style={styles.sectionHint}>
                  {availableTokens.length} available
                </Text>
              </View>
              <TouchableOpacity
                style={styles.tokenSelector}
                onPress={() => setShowTokenSelector(true)}
                activeOpacity={0.7}
              >
                {selectedToken ? (
                  <>
                    <View style={styles.tokenSelectorLeft}>
                      <View style={styles.tokenIconOuterWrap}>
                        {selectedToken.logo ? (
                          <Image
                            source={{ uri: selectedToken.logo }}
                            style={styles.selectedTokenLogo}
                          />
                        ) : (
                          <View
                            style={[
                              styles.tokenIcon,
                              selectedToken.isNative && styles.tokenIconNative,
                            ]}
                          >
                            <Text style={styles.tokenIconText}>
                              {selectedToken.symbol.substring(0, 2)}
                            </Text>
                          </View>
                        )}
                        {!selectedToken.isNative && (
                          <ChainBadge
                            uri={activeChain?.icon}
                            borderColor={theme.COLORS.background}
                          />
                        )}
                      </View>
                      <View>
                        <Text style={styles.selectedTokenSymbol}>
                          {selectedToken.symbol}
                        </Text>
                        <Text style={styles.selectedTokenBalance}>
                          {parseFloat(selectedToken.balance).toFixed(4)}{" "}
                          available
                        </Text>
                      </View>
                    </View>
                    <Ionicons
                      name="chevron-down"
                      size={20}
                      color={theme.COLORS.textSecondary}
                    />
                  </>
                ) : (
                  <>
                    <Text style={styles.selectorPlaceholder}>Select token</Text>
                    <Ionicons
                      name="chevron-down"
                      size={20}
                      color={theme.COLORS.textSecondary}
                    />
                  </>
                )}
              </TouchableOpacity>
              {errors.token && (
                <Text style={styles.errorText}>{errors.token}</Text>
              )}
            </View>

            {/* ── Recipient ── */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionLabel}>Recipient</Text>
                {recipientMode === "address" && (
                  <TouchableOpacity
                    onPress={() => setShowQRScanner(true)}
                    style={styles.iconButton}
                  >
                    <Ionicons
                      name="scan-outline"
                      size={16}
                      color={theme.COLORS.primary}
                    />
                  </TouchableOpacity>
                )}
              </View>

              {/* Mode toggle pills */}
              <View style={styles.modeToggle}>
                {RECIPIENT_MODES.map((mode) => {
                  const active = recipientMode === mode.key;
                  return (
                    <TouchableOpacity
                      key={mode.key}
                      style={[
                        styles.modePill,
                        active && {
                          backgroundColor: theme.COLORS.primary,
                          borderColor: theme.COLORS.primary,
                        },
                      ]}
                      onPress={() => switchMode(mode.key)}
                      activeOpacity={0.75}
                    >
                      <Feather
                        name={mode.icon}
                        size={12}
                        color={
                          active
                            ? theme.COLORS.background
                            : theme.COLORS.textSecondary
                        }
                      />
                      <Text
                        style={[
                          styles.modePillLabel,
                          {
                            color: active
                              ? theme.COLORS.background
                              : theme.COLORS.textSecondary,
                          },
                        ]}
                      >
                        {mode.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Input */}
              <View style={styles.recipientInputWrapper}>
                <Input
                  value={recipient}
                  onChangeText={(text) => {
                    setRecipient(text);
                    if (errors.recipient)
                      setErrors((prev) => ({ ...prev, recipient: null }));
                  }}
                  placeholder={
                    recipientMode === "address"
                      ? "0x... or ENS name"
                      : recipientMode === "username"
                        ? "@username"
                        : "user@example.com"
                  }
                  error={errors.recipient || resolveError}
                  autoCapitalize="none"
                  keyboardType={
                    recipientMode === "email" ? "email-address" : "default"
                  }
                  containerStyle={styles.inputContainer}
                />
                {resolving && (
                  <View style={styles.resolveSpinner}>
                    <ActivityIndicator
                      size="small"
                      color={theme.COLORS.primary}
                    />
                  </View>
                )}
              </View>

              {/* Resolved address chip */}
              {resolvedAddress && recipientMode !== "address" && (
                <Animated.View
                  style={[
                    styles.resolvedChip,
                    {
                      opacity: resolveChipAnim,
                      transform: [
                        {
                          translateY: resolveChipAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [6, 0],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <View style={styles.resolvedChipDot} />
                  <Text style={styles.resolvedChipLabel}>Resolves to</Text>
                  <Text style={styles.resolvedChipAddress}>
                    {formatAddress(resolvedAddress, 12)}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setRecipient("");
                      setResolvedAddress(null);
                      animateResolveChip(false);
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather
                      name="x"
                      size={13}
                      color={theme.COLORS.textSecondary}
                    />
                  </TouchableOpacity>
                </Animated.View>
              )}
            </View>

            {/* ── Amount ── */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionLabel}>Amount</Text>
                <TouchableOpacity
                  onPress={setMaxAmount}
                  disabled={!selectedToken}
                >
                  <Text style={styles.maxButton}>MAX</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.amountInputWrapper}>
                <Input
                  value={amount}
                  onChangeText={(text) => {
                    const cleaned = text.replace(/[^0-9.]/g, "");
                    const parts = cleaned.split(".");
                    const formatted =
                      parts.length > 2
                        ? parts[0] + "." + parts.slice(1).join("")
                        : cleaned;
                    setAmount(formatted);
                    if (errors.amount)
                      setErrors((prev) => ({ ...prev, amount: null }));
                  }}
                  placeholder="0.0"
                  keyboardType="decimal-pad"
                  error={errors.amount}
                  containerStyle={styles.inputContainer}
                  style={styles.amountInputText}
                />
                {selectedToken && (
                  <Text style={styles.amountSymbol}>
                    {selectedToken.symbol}
                  </Text>
                )}
              </View>
            </View>

            {/* ── Gas Estimate ── */}
            {estimatingGas && (
              <View style={styles.gasLoading}>
                <ActivityIndicator size="small" color={theme.COLORS.primary} />
                <Text style={styles.gasLoadingText}>Estimating fee...</Text>
              </View>
            )}

            {gasEstimate && !errors.gas && !estimatingGas && (
              <View style={styles.gasCard}>
                <View style={styles.gasRow}>
                  <Text style={styles.gasLabel}>Network Fee</Text>
                  <View style={styles.gasRight}>
                    <Text style={styles.gasAmount}>
                      {parseFloat(gasEstimate.totalCost).toFixed(6)}{" "}
                      {activeChain.symbol}
                    </Text>
                  </View>
                </View>
                <View style={styles.gasDivider} />
                <View style={styles.gasDetailRow}>
                  <Text style={styles.gasDetailLabel}>Gas Price</Text>
                  <Text style={styles.gasDetailValue}>
                    {parseFloat(gasEstimate.gasPriceGwei).toFixed(2)} Gwei
                  </Text>
                </View>
                <View style={styles.gasDetailRow}>
                  <Text style={styles.gasDetailLabel}>Gas Limit</Text>
                  <Text style={styles.gasDetailValue}>
                    {gasEstimate.gasLimit.toLocaleString()}
                  </Text>
                </View>
              </View>
            )}

            {errors.gas && (
              <View style={styles.errorCard}>
                <Ionicons
                  name="alert-circle-outline"
                  size={16}
                  color={theme.COLORS.error}
                />
                <Text style={styles.errorCardText}>{errors.gas}</Text>
              </View>
            )}

            {/* ── Total Summary ── */}
            {gasEstimate &&
              amount &&
              selectedToken &&
              !errors.gas &&
              !estimatingGas && (
                <View style={styles.summaryCard}>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>You send</Text>
                    <Text style={styles.summaryValue}>
                      {amount} {selectedToken.symbol}
                    </Text>
                  </View>
                  {recipientMode !== "address" && resolvedAddress && (
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>To wallet</Text>
                      <Text style={[styles.summaryValue, styles.summaryMono]}>
                        {formatAddress(resolvedAddress, 10)}
                      </Text>
                    </View>
                  )}
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Network fee</Text>
                    <Text style={styles.summaryValue}>
                      {parseFloat(gasEstimate.totalCost).toFixed(6)}{" "}
                      {activeChain.symbol}
                    </Text>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabelTotal}>Total</Text>
                    {selectedToken.isNative ? (
                      <Text style={styles.summaryValueTotal}>
                        {(
                          parseFloat(amount) + parseFloat(gasEstimate.totalCost)
                        ).toFixed(6)}{" "}
                        {activeChain.symbol}
                      </Text>
                    ) : (
                      <View style={styles.summaryRight}>
                        <Text style={styles.summaryValueTotal}>
                          {amount} {selectedToken.symbol}
                        </Text>
                        <Text style={styles.summaryValueSecondary}>
                          + {parseFloat(gasEstimate.totalCost).toFixed(6)}{" "}
                          {activeChain.symbol} fee
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              )}

            <Button
              title={estimatingGas ? "Estimating..." : "Continue"}
              onPress={handleSend}
              loading={loading || estimatingGas}
              disabled={
                !selectedToken ||
                !recipient ||
                !amount ||
                !!errors.gas ||
                estimatingGas ||
                resolving ||
                (recipientMode !== "address" && !resolvedAddress)
              }
              fullWidth
            />
          </>
        )}
      </ScrollView>

      {/* ── Token Selector Modal ── */}
      <Modal
        visible={showTokenSelector}
        animationType="slide"
        transparent
        onRequestClose={() => setShowTokenSelector(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Token</Text>
              <TouchableOpacity
                onPress={() => setShowTokenSelector(false)}
                style={styles.modalClose}
              >
                <Ionicons name="close" size={24} color={theme.COLORS.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={availableTokens}
              keyExtractor={(item) => item.id.toString()}
              renderItem={renderTokenItem}
              contentContainerStyle={styles.tokenList}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          </View>
        </View>
      </Modal>

      <QRScanner
        visible={showQRScanner}
        onClose={() => setShowQRScanner(false)}
        onScan={handleQRScan}
      />

      <ChainSwitcher
        visible={showChainSwitcher}
        onClose={() => setShowChainSwitcher(false)}
      />

      {txConfig && (
        <TransactionModal
          visible={showTransactionModal}
          onClose={() => setShowTransactionModal(false)}
          contractAddress={txConfig.isNative ? null : txConfig.contractAddress}
          contractABI={txConfig.isNative ? null : txConfig.contractABI}
          functionName={txConfig.isNative ? null : txConfig.functionName}
          args={txConfig.isNative ? null : txConfig.args}
          value={txConfig.value}
          isNativeTransfer={txConfig.isNative}
          to={txConfig.isNative ? txConfig.to : null}
          chainSymbol={activeChain.symbol}
          title={`Send ${selectedToken?.symbol}`}
          description={`Sending ${amount} ${selectedToken?.symbol} to ${recipientDisplayLabel}`}
          onSuccess={handleTransactionSuccess}
          onError={handleTransactionError}
        />
      )}
    </KeyboardAvoidingView>
  );
};

const createStyles = (theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.COLORS.background },
    content: { padding: 16, paddingBottom: 24 },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: theme.COLORS.background,
    },
    loadingText: {
      marginTop: 12,
      fontSize: 13,
      color: theme.COLORS.textSecondary,
    },

    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 20,
    },
    headerTitle: { fontSize: 20, fontWeight: "700", color: theme.COLORS.text },
    headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
    refreshIndicator: { marginRight: 4 },
    networkButton: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.COLORS.surface,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 16,
      gap: 6,
      borderWidth: 1,
      borderColor: theme.COLORS.border,
    },
    networkIcon: { width: 16, height: 16, borderRadius: 8 },
    networkText: { fontSize: 12, fontWeight: "500", color: theme.COLORS.text },

    emptyState: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 60,
    },
    emptyText: {
      fontSize: 16,
      fontWeight: "600",
      color: theme.COLORS.text,
      marginTop: 16,
      marginBottom: 4,
    },
    emptySubtext: {
      fontSize: 13,
      color: theme.COLORS.textSecondary,
      marginBottom: 20,
    },
    emptyButton: { marginTop: 8 },

    section: { marginBottom: 20 },
    sectionHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
    },
    sectionLabel: {
      fontSize: 11,
      fontWeight: "600",
      color: theme.COLORS.textSecondary,
      textTransform: "uppercase",
    },
    sectionHint: { fontSize: 11, color: theme.COLORS.textSecondary },
    iconButton: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: theme.COLORS.surface,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.COLORS.border,
    },
    maxButton: { fontSize: 11, fontWeight: "700", color: theme.COLORS.primary },
    inputContainer: { marginBottom: 0 },

    tokenSelector: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: theme.COLORS.surface,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: theme.COLORS.border,
    },
    tokenSelectorLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      flex: 1,
    },
    selectedTokenLogo: { width: 32, height: 32, borderRadius: 16 },
    tokenIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: theme.COLORS.primaryLight,
      justifyContent: "center",
      alignItems: "center",
    },
    tokenIconNative: { backgroundColor: theme.COLORS.primary },
    tokenIconText: {
      fontSize: 12,
      fontWeight: "600",
      color: theme.COLORS.background,
    },
    selectedTokenSymbol: {
      fontSize: 14,
      fontWeight: "600",
      color: theme.COLORS.text,
    },
    selectedTokenBalance: {
      fontSize: 11,
      color: theme.COLORS.textSecondary,
      marginTop: 2,
    },
    selectorPlaceholder: { fontSize: 14, color: theme.COLORS.textSecondary },

    modeToggle: {
      flexDirection: "row",
      backgroundColor: theme.COLORS.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.COLORS.border,
      padding: 3,
      marginBottom: 10,
      gap: 3,
    },
    modePill: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      paddingVertical: 7,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: "transparent",
    },
    modePillLabel: { fontSize: 12, fontWeight: "600" },

    recipientInputWrapper: { position: "relative" },
    resolveSpinner: {
      position: "absolute",
      right: 12,
      top: 0,
      bottom: 0,
      justifyContent: "center",
    },

    resolvedChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 8,
      backgroundColor: theme.COLORS.success + "14",
      borderWidth: 1,
      borderColor: theme.COLORS.success + "35",
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    resolvedChipDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: theme.COLORS.success,
      flexShrink: 0,
    },
    resolvedChipLabel: {
      fontSize: 11,
      fontWeight: "600",
      color: theme.COLORS.textSecondary,
    },
    resolvedChipAddress: {
      flex: 1,
      fontSize: 12,
      fontWeight: "600",
      color: theme.COLORS.text,
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    },

    amountInputWrapper: { position: "relative" },
    amountInputText: { fontSize: 20, fontWeight: "600" },
    amountSymbol: {
      position: "absolute",
      right: 12,
      top: "50%",
      transform: [{ translateY: -10 }],
      fontSize: 14,
      fontWeight: "500",
      color: theme.COLORS.textSecondary,
    },

    gasLoading: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.COLORS.surface,
      padding: 12,
      borderRadius: 8,
      marginBottom: 16,
      gap: 8,
    },
    gasLoadingText: { fontSize: 12, color: theme.COLORS.textSecondary },
    gasCard: {
      backgroundColor: theme.COLORS.surface,
      borderRadius: 12,
      padding: 12,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: theme.COLORS.border,
    },
    gasRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 8,
    },
    gasLabel: { fontSize: 13, fontWeight: "500", color: theme.COLORS.text },
    gasRight: { alignItems: "flex-end" },
    gasAmount: { fontSize: 14, fontWeight: "600", color: theme.COLORS.text },
    gasDivider: {
      height: 1,
      backgroundColor: theme.COLORS.border,
      marginVertical: 8,
    },
    gasDetailRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 4,
    },
    gasDetailLabel: { fontSize: 11, color: theme.COLORS.textSecondary },
    gasDetailValue: {
      fontSize: 11,
      color: theme.COLORS.text,
      fontWeight: "500",
    },
    errorCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.COLORS.error + "10",
      padding: 12,
      borderRadius: 8,
      marginBottom: 16,
      gap: 8,
    },
    errorCardText: { flex: 1, fontSize: 11, color: theme.COLORS.error },

    summaryCard: {
      backgroundColor: theme.COLORS.surface,
      borderRadius: 12,
      padding: 12,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: theme.COLORS.primary + "30",
    },
    summaryRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    summaryLabel: { fontSize: 12, color: theme.COLORS.textSecondary },
    summaryValue: { fontSize: 12, color: theme.COLORS.text, fontWeight: "500" },
    summaryMono: {
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
      fontSize: 11,
    },
    summaryRight: { alignItems: "flex-end" },
    summaryDivider: {
      height: 1,
      backgroundColor: theme.COLORS.border,
      marginVertical: 8,
    },
    summaryLabelTotal: {
      fontSize: 14,
      fontWeight: "600",
      color: theme.COLORS.text,
    },
    summaryValueTotal: {
      fontSize: 14,
      fontWeight: "600",
      color: theme.COLORS.primary,
    },
    summaryValueSecondary: {
      fontSize: 10,
      color: theme.COLORS.textSecondary,
      marginTop: 2,
    },
    errorText: { fontSize: 11, color: theme.COLORS.error, marginTop: 6 },

    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "flex-end",
    },
    modalContent: {
      backgroundColor: theme.COLORS.background,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: "80%",
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.COLORS.border,
    },
    modalTitle: { fontSize: 16, fontWeight: "600", color: theme.COLORS.text },
    modalClose: { padding: 4 },
    tokenList: { padding: 16 },
    tokenItem: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 12,
      borderRadius: 12,
      backgroundColor: theme.COLORS.surface,
    },
    tokenItemSelected: {
      backgroundColor: theme.COLORS.primaryLight,
      borderWidth: 1,
      borderColor: theme.COLORS.primary,
    },
    tokenItemLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      flex: 1,
    },
    tokenIconOuterWrap: { position: "relative" },
    tokenLogo: { width: 32, height: 32, borderRadius: 16 },
    tokenItemInfo: { flex: 1 },
    tokenItemHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
    tokenItemSymbol: {
      fontSize: 14,
      fontWeight: "600",
      color: theme.COLORS.text,
    },
    sourceBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    sourceBadgeText: {
      fontSize: 9,
      fontWeight: "600",
      textTransform: "uppercase",
    },
    tokenItemName: {
      fontSize: 11,
      color: theme.COLORS.textSecondary,
      marginTop: 2,
    },
    tokenItemRight: { alignItems: "flex-end" },
    tokenItemBalance: {
      fontSize: 13,
      fontWeight: "600",
      color: theme.COLORS.text,
    },
    tokenItemBalanceZero: { color: theme.COLORS.textSecondary },
    separator: { height: 8 },
  });

export default SendScreen;
