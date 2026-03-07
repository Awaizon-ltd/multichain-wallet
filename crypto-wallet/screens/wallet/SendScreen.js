import React, { useState, useEffect, useRef } from "react";
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

// Import modular blockchain utilities
import { getAllTokenBalances } from "../../utils/blockchain/Balances";
import {
  estimateNativeTransferGas,
  estimateTokenTransferGas,
} from "../../utils/blockchain/Gas";

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
];

const API_BASE_URL = API_CONFIG.BASE_URL;

// ─────────────────────────────────────────────────────────────────────────────
// Recipient input modes
// ─────────────────────────────────────────────────────────────────────────────
const RECIPIENT_MODES = [
  { key: "address", label: "Address", icon: "hash" },
  { key: "username", label: "Username", icon: "at-sign" },
  { key: "email", label: "Email", icon: "mail" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Identity resolve API — calls the same endpoint used in BindWalletScreen
// ─────────────────────────────────────────────────────────────────────────────
const resolveIdentity = async (emailOrUsername) => {
  const res = await fetch(
    `${API_BASE_URL}/wallets/resolve?email_or_username=${encodeURIComponent(emailOrUsername.trim())}`,
  );
  const json = await res.json();
  if (!res.ok) throw { status: res.status, ...json };
  return json; // { success: true, data: { wallet_address, username, email, ... } }
};

const SendScreen = ({ navigation, route }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { address, getBalanceForChain, refreshAllBalances } = useWallet();
  const { activeChain } = useChain();
  const { token: routeToken } = route.params || {};

  // ── Token state ────────────────────────────────────────────────────────────
  const [selectedToken, setSelectedToken] = useState(null);
  const [availableTokens, setAvailableTokens] = useState([]);
  const [loadingTokens, setLoadingTokens] = useState(true);

  // ── Recipient state ────────────────────────────────────────────────────────
  const [recipientMode, setRecipientMode] = useState("address"); // "address" | "username" | "email"
  const [recipient, setRecipient] = useState("");
  const [resolvedAddress, setResolvedAddress] = useState(null); // wallet address resolved from identity
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState(null);

  // ── Other state ────────────────────────────────────────────────────────────
  const [recentAddresses, setRecentAddresses] = useState([]);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [gasEstimate, setGasEstimate] = useState(null);
  const [estimatingGas, setEstimatingGas] = useState(false);
  const [errors, setErrors] = useState({});

  // ── Modal states ───────────────────────────────────────────────────────────
  const [showTokenSelector, setShowTokenSelector] = useState(false);
  const [showAddressPicker, setShowAddressPicker] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showChainSwitcher, setShowChainSwitcher] = useState(false);
  const [showTransactionModal, setShowTransactionModal] = useState(false);

  // ── Resolve chip animation ─────────────────────────────────────────────────
  const resolveChipAnim = useRef(new Animated.Value(0)).current;

  // ── Computed: the final wallet address to send to ──────────────────────────
  // In address mode: recipient directly
  // In username/email mode: resolvedAddress (populated after API call)
  const effectiveRecipient =
    recipientMode === "address" ? recipient : resolvedAddress;

  // ── Initialize tokens ──────────────────────────────────────────────────────
  useEffect(() => {
    if (address && activeChain) loadTokens();
  }, [activeChain, address]);

  useEffect(() => {
    if (routeToken) setSelectedToken(routeToken);
  }, [routeToken]);

  // ── Debounced identity resolve (username / email modes) ────────────────────
  useEffect(() => {
    if (recipientMode === "address") return;

    // Reset on empty
    if (!recipient.trim()) {
      setResolvedAddress(null);
      setResolveError(null);
      animateResolveChip(false);
      return;
    }

    setResolvedAddress(null);
    setResolveError(null);
    animateResolveChip(false);

    const timer = setTimeout(() => {
      doResolve(recipient.trim());
    }, 600);

    return () => clearTimeout(timer);
  }, [recipient, recipientMode]);

  // ── Debounced gas estimation ───────────────────────────────────────────────
  useEffect(() => {
    const dest = effectiveRecipient;
    if (dest && amount && address && selectedToken) {
      const timer = setTimeout(() => estimateGas(), 500);
      return () => clearTimeout(timer);
    } else {
      setGasEstimate(null);
    }
  }, [effectiveRecipient, amount, selectedToken]);

  // ── Resolve chip animation helper ─────────────────────────────────────────
  const animateResolveChip = (show) => {
    Animated.spring(resolveChipAnim, {
      toValue: show ? 1 : 0,
      useNativeDriver: true,
      tension: 60,
      friction: 10,
    }).start();
  };

  // ── Do the actual identity resolve ────────────────────────────────────────
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

  // ── Mode switch — clear recipient state ────────────────────────────────────
  const switchMode = (mode) => {
    setRecipientMode(mode);
    setRecipient("");
    setResolvedAddress(null);
    setResolveError(null);
    animateResolveChip(false);
    setGasEstimate(null);
    setErrors((prev) => ({ ...prev, recipient: null }));
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Load tokens (unchanged from original)
  // ─────────────────────────────────────────────────────────────────────────────
  const loadTokens = async () => {
    try {
      setLoadingTokens(true);
      if (!address) return;

      const nativeBalance = getBalanceForChain(activeChain.id);
      const nativeToken = {
        id: "native",
        symbol: activeChain.symbol,
        name: activeChain.name,
        address: null,
        balance: nativeBalance.formatted,
        decimals: 18,
        isNative: true,
        logo: activeChain.icon,
        source: "native",
      };

      const userAddress = address.toLowerCase();
      const normalizedChainId = parseInt(activeChain.id);
      const importedTokens = await getTokensByChain(
        userAddress,
        normalizedChainId,
      );

      const alchemyTokens = await getAllTokenBalances(address, activeChain);
      const alchemyBalanceMap = {};
      alchemyTokens.forEach((token) => {
        alchemyBalanceMap[token.address.toLowerCase()] = token;
      });

      const mergedTokens = importedTokens.map((dbToken) => {
        const alchemyToken = alchemyBalanceMap[dbToken.address.toLowerCase()];
        return {
          id: dbToken.address,
          symbol: dbToken.symbol,
          name: dbToken.name,
          address: dbToken.address,
          balance: alchemyToken ? alchemyToken.formatted : "0",
          decimals: dbToken.decimals,
          isNative: false,
          logo: dbToken.logo || alchemyToken?.logo,
          source: "database",
        };
      });

      const dbTokenAddresses = new Set(
        importedTokens.map((t) => t.address.toLowerCase()),
      );
      const additionalAlchemyTokens = alchemyTokens
        .filter((token) => !dbTokenAddresses.has(token.address.toLowerCase()))
        .map((token) => ({
          id: token.address,
          symbol: token.symbol,
          name: token.name,
          address: token.address,
          balance: token.formatted,
          decimals: token.decimals,
          isNative: false,
          logo: token.logo,
          source: "alchemy",
        }));

      const allTokensData = [
        nativeToken,
        ...mergedTokens,
        ...additionalAlchemyTokens,
      ];
      allTokensData.sort(
        (a, b) => (parseFloat(b.balance) || 0) - (parseFloat(a.balance) || 0),
      );

      setAvailableTokens(allTokensData);
      if (!selectedToken && !routeToken) setSelectedToken(nativeToken);
      setRecentAddresses([]);
    } catch (error) {
      console.error("[SendScreen] Error loading tokens:", error);
      Alert.alert("Error", "Failed to load tokens");
    } finally {
      setLoadingTokens(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Gas estimation (uses effectiveRecipient)
  // ─────────────────────────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────────────────────
  // Form validation (uses effectiveRecipient)
  // ─────────────────────────────────────────────────────────────────────────────
  const validateForm = () => {
    const newErrors = {};

    if (!selectedToken) newErrors.token = "Please select a token";

    // In identity mode, check that resolution succeeded
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

  const handleTransactionSuccess = async (receipt) => {
    try {
      await refreshAllBalances();
      Alert.alert("Success", `Sent ${amount} ${selectedToken.symbol}`, [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
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
      if (gasEstimate) {
        const maxAmount = Math.max(
          0,
          parseFloat(selectedToken.balance) -
            parseFloat(gasEstimate.totalCost) -
            0.000001,
        ).toFixed(6);
        setAmount(maxAmount);
      } else {
        setAmount((parseFloat(selectedToken.balance) * 0.8).toFixed(6));
      }
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

  const handleSelectAddress = (addr) => {
    setRecipient(addr);
    setShowAddressPicker(false);
  };

  const handleQRScan = (scannedAddress) => {
    setRecipientMode("address");
    setRecipient(scannedAddress);
    setShowQRScanner(false);
  };

  const getTokenSourceBadge = (source) => {
    if (source === "database")
      return { label: "Imported", color: theme.COLORS.primary };
    if (source === "alchemy")
      return { label: "Auto", color: theme.COLORS.success };
    return null;
  };

  const renderTokenItem = ({ item }) => {
    const balanceNum = parseFloat(item.balance);
    const hasBalance = balanceNum > 0;
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
          <Text
            style={[
              styles.tokenItemBalance,
              !hasBalance && styles.tokenItemBalanceZero,
            ]}
          >
            {balanceNum.toFixed(4)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderAddressItem = ({ item }) => (
    <TouchableOpacity
      style={styles.addressItem}
      onPress={() => handleSelectAddress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.addressIcon}>
        <Ionicons name="time" size={16} color={theme.COLORS.background} />
      </View>
      <View style={styles.addressInfo}>
        <Text style={styles.addressValue}>{formatAddress(item, 10)}</Text>
      </View>
    </TouchableOpacity>
  );

  if (loadingTokens) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.COLORS.primary} />
        <Text style={styles.loadingText}>Loading tokens...</Text>
      </View>
    );
  }

  const getTransactionConfig = () => {
    const dest = effectiveRecipient;
    if (!selectedToken || !dest || !amount) return null;

    if (selectedToken.isNative) {
      return {
        isNative: true,
        to: dest,
        value: parseUnits(amount, 18).toString(),
      };
    } else {
      return {
        isNative: false,
        contractAddress: selectedToken.address,
        contractABI: ERC20_ABI,
        functionName: "transfer",
        args: [dest, parseUnits(amount, selectedToken.decimals)],
        value: "0",
      };
    }
  };

  const txConfig = getTransactionConfig();

  // ── Recipient label for the transaction description ────────────────────────
  const recipientDisplayLabel =
    recipientMode === "address"
      ? formatAddress(recipient, 10)
      : `${recipient} (${formatAddress(resolvedAddress || "", 8)})`;

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
                <View style={styles.inputActions}>
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
                  {recentAddresses.length > 0 &&
                    recipientMode === "address" && (
                      <TouchableOpacity
                        onPress={() => setShowAddressPicker(true)}
                        style={styles.iconButton}
                      >
                        <Ionicons
                          name="time-outline"
                          size={16}
                          color={theme.COLORS.primary}
                        />
                      </TouchableOpacity>
                    )}
                </View>
              </View>

              {/* ── Mode toggle pills ── */}
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

              {/* ── Input ── */}
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
                {/* Spinner while resolving */}
                {resolving && (
                  <View style={styles.resolveSpinner}>
                    <ActivityIndicator
                      size="small"
                      color={theme.COLORS.primary}
                    />
                  </View>
                )}
              </View>

              {/* ── Resolved address chip ── */}
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
                  {/* Show the actual destination address when resolving from identity */}
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

      {/* ── Address Picker Modal ── */}
      <Modal
        visible={showAddressPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAddressPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Recent Addresses</Text>
              <TouchableOpacity
                onPress={() => setShowAddressPicker(false)}
                style={styles.modalClose}
              >
                <Ionicons name="close" size={24} color={theme.COLORS.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={recentAddresses}
              keyExtractor={(item, index) => index.toString()}
              renderItem={renderAddressItem}
              contentContainerStyle={styles.addressList}
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
          value={txConfig.isNative ? txConfig.value : txConfig.value}
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
    container: {
      flex: 1,
      backgroundColor: theme.COLORS.background,
    },
    content: {
      padding: 16,
      paddingBottom: 24,
    },
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

    // Header
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 20,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: "700",
      color: theme.COLORS.text,
    },
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

    // Empty state
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

    // Sections
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
    inputActions: { flexDirection: "row", gap: 6 },
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
    maxButton: {
      fontSize: 11,
      fontWeight: "700",
      color: theme.COLORS.primary,
    },
    inputContainer: { marginBottom: 0 },

    // Token selector
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
    selectorPlaceholder: {
      fontSize: 14,
      color: theme.COLORS.textSecondary,
    },

    // Recipient mode toggle
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
      backgroundColor: "transparent",
    },
    modePillLabel: {
      fontSize: 12,
      fontWeight: "600",
    },

    // Recipient input
    recipientInputWrapper: { position: "relative" },
    resolveSpinner: {
      position: "absolute",
      right: 12,
      top: 0,
      bottom: 0,
      justifyContent: "center",
    },

    // Resolved address chip
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

    // Amount
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

    // Gas
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

    // Summary
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

    // Modals
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
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
    modalTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: theme.COLORS.text,
    },
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
    tokenLogo: { width: 32, height: 32, borderRadius: 16 },
    tokenItemInfo: { flex: 1 },
    tokenItemHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    tokenItemSymbol: {
      fontSize: 14,
      fontWeight: "600",
      color: theme.COLORS.text,
    },
    sourceBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
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
    addressList: { padding: 16 },
    addressItem: {
      flexDirection: "row",
      alignItems: "center",
      padding: 12,
      borderRadius: 12,
      backgroundColor: theme.COLORS.surface,
      gap: 10,
      marginBottom: 8,
    },
    addressIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: theme.COLORS.primary,
      justifyContent: "center",
      alignItems: "center",
    },
    addressInfo: { flex: 1 },
    addressValue: {
      fontSize: 12,
      color: theme.COLORS.text,
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    },
  });

export default SendScreen;
