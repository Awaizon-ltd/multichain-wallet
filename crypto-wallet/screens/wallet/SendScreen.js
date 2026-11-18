import React, { useState, useEffect, useCallback, useMemo } from "react";
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
  TextInput,
  Clipboard,
} from "react-native";
import { useWallet } from "../../contexts/WalletContext";
import { useChain } from "../../contexts/ChainContext";
import { useTheme } from "../../contexts/ThemeContext";
import Button from "../../components/common/Button";
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

// Email send is disabled for now — only on-chain address and username
// (resolved through the same backend identity lookup) remain.
const RECIPIENT_MODES = [
  { key: "address", label: "Address", icon: "hash" },
  { key: "username", label: "Username", icon: "at-sign" },
];

const PERCENTS = [
  { label: "25%", value: 0.25 },
  { label: "50%", value: 0.5 },
  { label: "75%", value: 0.75 },
  { label: "Max", value: 1 },
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

  const updated = existing.map((t) => incomingMap[t.id] ?? t);

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
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { address, accounts, getBalanceForChain, refreshAllBalances } =
    useWallet();
  const { activeChain } = useChain();
  const { token: routeToken, recipient: routeRecipient } = route.params || {};

  // ── Token state ────────────────────────────────────────────────────────────
  const [selectedToken, setSelectedToken] = useState(null);
  const [availableTokens, setAvailableTokens] = useState([]);
  // loadingTokens → Phase 1 only (blocks render). refreshingBalances → Phase 2.
  const [loadingTokens, setLoadingTokens] = useState(true);
  const [refreshingBalances, setRefreshingBalances] = useState(false);

  // ── Recipient state ────────────────────────────────────────────────────────
  const [recipientMode, setRecipientMode] = useState("address");
  const [recipient, setRecipient] = useState(routeRecipient ?? "");
  const [recipientFocused, setRecipientFocused] = useState(false);
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

  // ── Computed ───────────────────────────────────────────────────────────────
  const effectiveRecipient =
    recipientMode === "address" ? recipient : resolvedAddress;

  const addressCheck = useMemo(
    () =>
      recipientMode === "address" && recipient
        ? validateAddress(recipient)
        : null,
    [recipient, recipientMode],
  );
  const addressValid = !!addressCheck?.isValid;

  // Other accounts in this wallet — quick pick
  const myOtherAccounts = useMemo(
    () =>
      (Array.isArray(accounts) ? accounts : []).filter(
        (a) => a?.address && a.address.toLowerCase() !== address?.toLowerCase(),
      ),
    [accounts, address],
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Token loading — two-phase to minimise perceived latency
  // Phase 1: native token + local DB tokens render immediately.
  // Phase 2: on-chain balances fetched in background and merged in place.
  // ─────────────────────────────────────────────────────────────────────────────
  const loadTokens = useCallback(async () => {
    if (!address || !activeChain) return;

    // ── Phase 1: instant render ───────────────────────────────────────────────
    const nativeBalance = getBalanceForChain(activeChain.id);
    const nativeToken = buildNativeToken(activeChain, nativeBalance);

    const userAddress = address.toLowerCase();
    const normalizedChainId = parseInt(activeChain.id);

    const importedTokens = await getTokensByChain(
      userAddress,
      normalizedChainId,
    );

    const phase1Tokens = [
      nativeToken,
      ...importedTokens.map((t) => formatDbToken(t, "0", true)),
    ];
    setAvailableTokens(phase1Tokens);
    setLoadingTokens(false);

    if (!selectedToken && !routeToken) setSelectedToken(nativeToken);

    // ── Phase 2: background balance fetch ────────────────────────────────────
    setRefreshingBalances(true);
    try {
      const [discoveredTokens] = await Promise.all([
        getAllTokenBalances(address, activeChain),
      ]);

      const discoveredMap = {};
      discoveredTokens.forEach((t) => {
        discoveredMap[t.address.toLowerCase()] = t;
      });

      const dbMap = {};
      importedTokens.forEach((t) => {
        dbMap[t.address.toLowerCase()] = t;
      });

      const discoveredFormatted = discoveredTokens.map((token) =>
        formatDiscoveredToken(
          token,
          dbMap[token.address.toLowerCase()] ?? null,
        ),
      );

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
            return formatDbToken(dbToken, "0", false);
          }
        }),
      );

      setAvailableTokens((prev) =>
        mergeTokenLists(prev, [...discoveredFormatted, ...directResults]),
      );
    } catch (error) {
      console.error("[SendScreen] Background balance refresh failed:", error);
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

    setResolvedAddress(null);
    setResolveError(null);

    if (!recipient.trim()) return;

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
  const doResolve = async (query) => {
    try {
      setResolving(true);
      const result = await resolveIdentity(query);
      const addr = result.data?.wallet_address;
      setResolvedAddress(addr);
      setResolveError(null);
    } catch (err) {
      setResolvedAddress(null);
      setResolveError(
        err.status === 404
          ? `No wallet found for "${query}"`
          : "Could not resolve identity. Try again.",
      );
    } finally {
      setResolving(false);
    }
  };

  const switchMode = (mode) => {
    if (mode === recipientMode) return;
    setRecipientMode(mode);
    setRecipient("");
    setResolvedAddress(null);
    setResolveError(null);
    setGasEstimate(null);
    setErrors((prev) => ({ ...prev, recipient: null }));
  };

  const handleRecipientChange = (text) => {
    // Addresses never contain whitespace, so strip it (handles pasted newlines)
    setRecipient(
      recipientMode === "address" ? text.replace(/\s/g, "") : text.trimStart(),
    );
    if (errors.recipient) setErrors((prev) => ({ ...prev, recipient: null }));
  };

  const handlePaste = async () => {
    try {
      const text = await Clipboard.getString();
      if (text) handleRecipientChange(text.trim());
    } catch (e) {}
  };

  const clearRecipient = () => {
    setRecipient("");
    setResolvedAddress(null);
    setResolveError(null);
    setGasEstimate(null);
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

    if (recipientMode === "username") {
      if (!recipient.trim()) {
        newErrors.recipient = "Enter a username";
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

  const setPercent = (p) => {
    if (!selectedToken) return;
    if (p === 1) return setMaxAmount();
    const v = parseFloat(selectedToken.balance) * p;
    if (!isFinite(v)) return;
    setAmount(v.toFixed(6).replace(/\.?0+$/, "") || "0");
  };

  const handleSelectToken = (token) => {
    setSelectedToken(token);
    setAmount("");
    setGasEstimate(null);
    setShowTokenSelector(false);
  };

  const handleQRScan = (scannedAddress) => {
    setRecipientMode("address");
    setRecipient(scannedAddress.replace(/\s/g, ""));
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

  const canSubmit =
    selectedToken &&
    recipient &&
    amount &&
    !errors.gas &&
    !estimatingGas &&
    !resolving &&
    (recipientMode !== "username" || !!resolvedAddress) &&
    (recipientMode !== "address" || addressValid);

  // ── Recipient field state ─────────────────────────────────────────────────
  const recipientState = (() => {
    if (recipientMode === "address") {
      if (!recipient) return { kind: "empty" };
      if (addressValid) return { kind: "valid" };
      if (!recipientFocused || errors.recipient)
        return {
          kind: "invalid",
          message:
            errors.recipient || addressCheck?.errors?.[0] || "Invalid address",
        };
      return { kind: "typing" };
    }
    if (!recipient.trim()) return { kind: "empty" };
    if (resolving) return { kind: "resolving" };
    if (resolvedAddress) return { kind: "valid" };
    if (resolveError || errors.recipient)
      return { kind: "invalid", message: resolveError || errors.recipient };
    return { kind: "typing" };
  })();

  const boxStyle = [
    styles.recipientBox,
    recipientFocused && styles.recipientBoxFocused,
    recipientState.kind === "valid" && styles.recipientBoxValid,
    recipientState.kind === "invalid" && styles.recipientBoxInvalid,
  ];

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
                  styles.tokenIconLg,
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
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="arrow-back" size={20} color={theme.COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Send</Text>
          <TouchableOpacity
            style={styles.networkPill}
            onPress={() => setShowChainSwitcher(true)}
            activeOpacity={0.7}
          >
            {refreshingBalances && (
              <ActivityIndicator
                size="small"
                color={theme.COLORS.textSecondary}
              />
            )}
            {activeChain.icon && (
              <Image
                source={{ uri: activeChain.icon }}
                style={styles.networkIcon}
              />
            )}
            <Feather
              name="chevron-down"
              size={12}
              color={theme.COLORS.textSecondary}
            />
          </TouchableOpacity>
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
            {/* ── To: recipient ── */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardTitle}>To</Text>
                <View style={styles.modeToggle}>
                  {RECIPIENT_MODES.map((mode) => {
                    const active = recipientMode === mode.key;
                    return (
                      <TouchableOpacity
                        key={mode.key}
                        style={[
                          styles.modePill,
                          active && styles.modePillActive,
                        ]}
                        onPress={() => switchMode(mode.key)}
                        activeOpacity={0.75}
                      >
                        <Feather
                          name={mode.icon}
                          size={11}
                          color={active ? "#000" : theme.COLORS.textSecondary}
                        />
                        <Text
                          style={[
                            styles.modePillLabel,
                            {
                              color: active
                                ? "#000"
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
              </View>

              <View style={boxStyle}>
                <TextInput
                  value={recipient}
                  onChangeText={handleRecipientChange}
                  onFocus={() => setRecipientFocused(true)}
                  onBlur={() => setRecipientFocused(false)}
                  placeholder={recipientMode === "address" ? "0x…" : "username"}
                  placeholderTextColor={theme.COLORS.textTertiary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  multiline={recipientMode === "address"}
                  style={[
                    styles.recipientInput,
                    recipientMode === "address" && styles.recipientInputMono,
                  ]}
                />

                <View style={styles.recipientFooter}>
                  {/* Status */}
                  <View style={styles.statusWrap}>
                    {recipientState.kind === "valid" && (
                      <>
                        <Ionicons
                          name="checkmark-circle"
                          size={15}
                          color={theme.COLORS.success}
                        />
                        <Text
                          style={[
                            styles.statusText,
                            { color: theme.COLORS.success },
                          ]}
                          numberOfLines={1}
                        >
                          {recipientMode === "address"
                            ? "Valid address"
                            : `Resolves to ${formatAddress(resolvedAddress || "", 10)}`}
                        </Text>
                      </>
                    )}
                    {recipientState.kind === "invalid" && (
                      <>
                        <Ionicons
                          name="alert-circle"
                          size={15}
                          color={theme.COLORS.error}
                        />
                        <Text
                          style={[
                            styles.statusText,
                            { color: theme.COLORS.error },
                          ]}
                          numberOfLines={2}
                        >
                          {recipientState.message}
                        </Text>
                      </>
                    )}
                    {recipientState.kind === "resolving" && (
                      <>
                        <ActivityIndicator
                          size="small"
                          color={theme.COLORS.primary}
                        />
                        <Text style={styles.statusText}>Looking up…</Text>
                      </>
                    )}
                    {(recipientState.kind === "empty" ||
                      recipientState.kind === "typing") && (
                      <Text style={styles.statusText}>
                        {recipientMode === "address"
                          ? "Paste or scan a wallet address"
                          : "Enter a username"}
                      </Text>
                    )}
                  </View>

                  {/* Actions */}
                  <View style={styles.actionsWrap}>
                    {recipient ? (
                      <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={clearRecipient}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons
                          name="close"
                          size={16}
                          color={theme.COLORS.text}
                        />
                      </TouchableOpacity>
                    ) : (
                      <>
                        <TouchableOpacity
                          style={styles.actionPill}
                          onPress={handlePaste}
                          activeOpacity={0.75}
                        >
                          <Ionicons
                            name="clipboard-outline"
                            size={14}
                            color={theme.COLORS.primary}
                          />
                          <Text style={styles.actionPillText}>Paste</Text>
                        </TouchableOpacity>
                        {recipientMode === "address" && (
                          <TouchableOpacity
                            style={styles.iconBtn}
                            onPress={() => setShowQRScanner(true)}
                            activeOpacity={0.75}
                          >
                            <Ionicons
                              name="scan-outline"
                              size={17}
                              color={theme.COLORS.primary}
                            />
                          </TouchableOpacity>
                        )}
                      </>
                    )}
                  </View>
                </View>
              </View>

              {/* My accounts quick pick */}
              {recipientMode === "address" &&
                !recipient &&
                myOtherAccounts.length > 0 && (
                  <View style={styles.myAccounts}>
                    <Text style={styles.myAccountsLabel}>My accounts</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      keyboardShouldPersistTaps="handled"
                      contentContainerStyle={styles.myAccountsRow}
                    >
                      {myOtherAccounts.map((acc) => (
                        <TouchableOpacity
                          key={acc.address}
                          style={styles.accountChip}
                          onPress={() => handleRecipientChange(acc.address)}
                          activeOpacity={0.75}
                        >
                          <View style={styles.accountChipAvatar}>
                            <Text style={styles.accountChipAvatarText}>
                              {(acc.name || "A").trim().charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <Text
                            style={styles.accountChipText}
                            numberOfLines={1}
                          >
                            {acc.name || formatAddress(acc.address, 6)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
            </View>

            {/* ── Amount ── */}
            <View style={styles.heroCard}>
              <View style={styles.heroTopRow}>
                <Text style={styles.cardTitle}>Amount</Text>
                <Text style={styles.heroBalanceHint}>
                  {selectedToken
                    ? `Balance ${parseFloat(selectedToken.balance).toFixed(4)} ${selectedToken.symbol}`
                    : "Select a token"}
                </Text>
              </View>

              <View style={styles.heroAmountRow}>
                <TextInput
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
                  placeholderTextColor={theme.COLORS.textTertiary}
                  keyboardType="decimal-pad"
                  style={styles.heroAmountInput}
                />

                <TouchableOpacity
                  style={styles.heroTokenPill}
                  onPress={() => setShowTokenSelector(true)}
                  activeOpacity={0.7}
                >
                  {selectedToken?.logo ? (
                    <Image
                      source={{ uri: selectedToken.logo }}
                      style={styles.heroTokenLogo}
                    />
                  ) : (
                    <View
                      style={[
                        styles.tokenIcon,
                        selectedToken?.isNative && styles.tokenIconNative,
                      ]}
                    >
                      <Text style={styles.tokenIconText}>
                        {selectedToken?.symbol?.substring(0, 2) || "?"}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.heroTokenSymbol}>
                    {selectedToken?.symbol || "Select"}
                  </Text>
                  <Ionicons
                    name="chevron-down"
                    size={14}
                    color={theme.COLORS.textSecondary}
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.percentRow}>
                {PERCENTS.map((p) => (
                  <TouchableOpacity
                    key={p.label}
                    style={styles.percentChip}
                    onPress={() => setPercent(p.value)}
                    disabled={!selectedToken}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.percentChipText}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {(errors.token || errors.amount) && (
                <Text style={styles.heroErrorText}>
                  {errors.token || errors.amount}
                </Text>
              )}
            </View>

            {/* ── Review ── */}
            <View style={styles.card}>
              <Text style={[styles.cardTitle, { marginBottom: 12 }]}>
                Review
              </Text>

              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>Network</Text>
                <View style={styles.reviewNetworkValue}>
                  {activeChain.icon && (
                    <Image
                      source={{ uri: activeChain.icon }}
                      style={styles.reviewNetworkIcon}
                    />
                  )}
                  <Text style={styles.reviewValue}>{activeChain.name}</Text>
                </View>
              </View>

              <View style={styles.reviewDivider} />

              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>Network fee</Text>
                {estimatingGas ? (
                  <View style={styles.reviewFeeLoading}>
                    <ActivityIndicator
                      size="small"
                      color={theme.COLORS.primary}
                    />
                    <Text style={styles.reviewFeeLoadingText}>
                      Estimating...
                    </Text>
                  </View>
                ) : errors.gas ? (
                  <Text style={styles.reviewError}>Unable to estimate</Text>
                ) : gasEstimate ? (
                  <Text style={styles.reviewValue}>
                    {parseFloat(gasEstimate.totalCost).toFixed(6)}{" "}
                    {activeChain.symbol}
                  </Text>
                ) : (
                  <Text style={styles.reviewValuePending}>—</Text>
                )}
              </View>

              {errors.gas && (
                <Text style={styles.reviewErrorDetail}>{errors.gas}</Text>
              )}

              {gasEstimate && !errors.gas && !estimatingGas && amount && (
                <>
                  <View style={styles.reviewDivider} />
                  <View style={styles.reviewRow}>
                    <Text style={styles.reviewLabelTotal}>Total</Text>
                    {selectedToken?.isNative ? (
                      <Text style={styles.reviewValueTotal}>
                        {(
                          parseFloat(amount) + parseFloat(gasEstimate.totalCost)
                        ).toFixed(6)}{" "}
                        {activeChain.symbol}
                      </Text>
                    ) : (
                      <View style={styles.reviewTotalStack}>
                        <Text style={styles.reviewValueTotal}>
                          {amount} {selectedToken.symbol}
                        </Text>
                        <Text style={styles.reviewValueSecondary}>
                          + {parseFloat(gasEstimate.totalCost).toFixed(6)}{" "}
                          {activeChain.symbol} fee
                        </Text>
                      </View>
                    )}
                  </View>
                </>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* ── Pinned send button ── */}
      {availableTokens.length > 0 && (
        <View style={styles.footer}>
          <Button
            title={estimatingGas ? "Estimating..." : "Review & Send"}
            onPress={handleSend}
            loading={loading || estimatingGas}
            disabled={!canSubmit}
            fullWidth
          />
        </View>
      )}

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
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 18,
    },
    backButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: theme.COLORS.surface,
      justifyContent: "center",
      alignItems: "center",
    },
    headerTitle: { fontSize: 18, fontWeight: "800", color: theme.COLORS.text },
    networkPill: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.COLORS.surface,
      paddingVertical: 7,
      paddingHorizontal: 12,
      borderRadius: 18,
      gap: 6,
    },
    networkIcon: { width: 18, height: 18, borderRadius: 9 },

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

    // ── Generic card ──
    card: {
      backgroundColor: theme.COLORS.surface,
      borderRadius: 22,
      padding: 16,
      marginBottom: 12,
    },
    cardHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
    },
    cardTitle: {
      fontSize: 13,
      fontWeight: "700",
      color: theme.COLORS.textSecondary,
    },

    modeToggle: {
      flexDirection: "row",
      backgroundColor: theme.COLORS.background,
      borderRadius: 12,
      padding: 3,
      gap: 3,
    },
    modePill: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 9,
    },
    modePillActive: { backgroundColor: theme.COLORS.primary },
    modePillLabel: { fontSize: 12, fontWeight: "700" },

    // ── Recipient field ──
    recipientBox: {
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: theme.COLORS.border,
      backgroundColor: theme.COLORS.background,
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 10,
    },
    recipientBoxFocused: { borderColor: theme.COLORS.primary },
    recipientBoxValid: { borderColor: theme.COLORS.success },
    recipientBoxInvalid: { borderColor: theme.COLORS.error },
    recipientInput: {
      fontSize: 16,
      fontWeight: "600",
      color: theme.COLORS.text,
      padding: 0,
      minHeight: 24,
      maxHeight: 64,
      textAlignVertical: "top",
    },
    recipientInputMono: {
      fontSize: 14,
      lineHeight: 21,
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    },
    recipientFooter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      marginTop: 10,
    },
    statusWrap: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    statusText: {
      flexShrink: 1,
      fontSize: 12,
      fontWeight: "600",
      color: theme.COLORS.textSecondary,
    },
    actionsWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
    actionPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 12,
      height: 32,
      borderRadius: 16,
      backgroundColor: theme.COLORS.primary + "1F",
    },
    actionPillText: {
      fontSize: 12,
      fontWeight: "700",
      color: theme.COLORS.primary,
    },
    iconBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.COLORS.primary + "1F",
    },

    // My accounts
    myAccounts: { marginTop: 14 },
    myAccountsLabel: {
      fontSize: 12,
      fontWeight: "700",
      color: theme.COLORS.textSecondary,
      marginBottom: 8,
    },
    myAccountsRow: { gap: 8 },
    accountChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 6,
      paddingLeft: 6,
      paddingRight: 12,
      borderRadius: 18,
      backgroundColor: theme.COLORS.background,
      borderWidth: 1,
      borderColor: theme.COLORS.border,
      maxWidth: 160,
    },
    accountChipAvatar: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.COLORS.primary + "26",
    },
    accountChipAvatarText: {
      fontSize: 11,
      fontWeight: "800",
      color: theme.COLORS.primary,
    },
    accountChipText: {
      fontSize: 12,
      fontWeight: "700",
      color: theme.COLORS.text,
      flexShrink: 1,
    },

    // ── Amount card ──
    heroCard: {
      backgroundColor: theme.COLORS.surface,
      borderRadius: 22,
      padding: 16,
      marginBottom: 12,
    },
    heroTopRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
    },
    heroBalanceHint: {
      fontSize: 12,
      fontWeight: "600",
      color: theme.COLORS.textSecondary,
    },
    heroAmountRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    heroAmountInput: {
      flex: 1,
      fontSize: 38,
      fontWeight: "800",
      letterSpacing: -0.5,
      color: theme.COLORS.text,
      padding: 0,
    },
    heroTokenPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: theme.COLORS.background,
      borderRadius: 20,
      paddingVertical: 7,
      paddingHorizontal: 12,
    },
    heroTokenLogo: { width: 24, height: 24, borderRadius: 12 },
    heroTokenSymbol: {
      fontSize: 14,
      fontWeight: "800",
      color: theme.COLORS.text,
    },
    percentRow: { flexDirection: "row", gap: 8, marginTop: 14 },
    percentChip: {
      flex: 1,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.COLORS.primary + "1F",
    },
    percentChipText: {
      fontSize: 12,
      fontWeight: "800",
      color: theme.COLORS.primary,
    },
    heroErrorText: { fontSize: 12, color: theme.COLORS.error, marginTop: 10 },

    tokenIcon: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: theme.COLORS.primaryLight,
      justifyContent: "center",
      alignItems: "center",
    },
    tokenIconLg: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: theme.COLORS.primaryLight,
      justifyContent: "center",
      alignItems: "center",
    },
    tokenIconNative: { backgroundColor: theme.COLORS.primary },
    tokenIconText: {
      fontSize: 10,
      fontWeight: "700",
      color: theme.COLORS.background,
    },

    // ── Review card ──
    reviewRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 4,
    },
    reviewLabel: { fontSize: 13, color: theme.COLORS.textSecondary },
    reviewValue: { fontSize: 13, fontWeight: "600", color: theme.COLORS.text },
    reviewValuePending: { fontSize: 13, color: theme.COLORS.textTertiary },
    reviewNetworkValue: { flexDirection: "row", alignItems: "center", gap: 6 },
    reviewNetworkIcon: { width: 16, height: 16, borderRadius: 8 },
    reviewDivider: {
      height: 1,
      backgroundColor: theme.COLORS.border,
      marginVertical: 8,
    },
    reviewFeeLoading: { flexDirection: "row", alignItems: "center", gap: 6 },
    reviewFeeLoadingText: { fontSize: 12, color: theme.COLORS.textSecondary },
    reviewError: { fontSize: 12, color: theme.COLORS.error, fontWeight: "600" },
    reviewErrorDetail: {
      fontSize: 11,
      color: theme.COLORS.error,
      marginTop: 4,
    },
    reviewLabelTotal: {
      fontSize: 14,
      fontWeight: "700",
      color: theme.COLORS.text,
    },
    reviewValueTotal: {
      fontSize: 14,
      fontWeight: "700",
      color: theme.COLORS.primary,
    },
    reviewTotalStack: { alignItems: "flex-end" },
    reviewValueSecondary: {
      fontSize: 10,
      color: theme.COLORS.textSecondary,
      marginTop: 2,
    },

    footer: {
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: Platform.OS === "ios" ? 28 : 16,
      backgroundColor: theme.COLORS.background,
      borderTopWidth: 1,
      borderTopColor: theme.COLORS.border,
    },

    // ── Token modal ──
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "flex-end",
    },
    modalContent: {
      backgroundColor: theme.COLORS.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
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
    modalTitle: { fontSize: 16, fontWeight: "700", color: theme.COLORS.text },
    modalClose: { padding: 4 },
    tokenList: { padding: 16 },
    tokenItem: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 12,
      borderRadius: 14,
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
      fontWeight: "700",
      color: theme.COLORS.text,
    },
    sourceBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    sourceBadgeText: {
      fontSize: 9,
      fontWeight: "700",
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
      fontWeight: "700",
      color: theme.COLORS.text,
    },
    tokenItemBalanceZero: { color: theme.COLORS.textSecondary },
    separator: { height: 8 },
  });

export default SendScreen;
