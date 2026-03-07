import React from "react";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../../contexts/ThemeContext";
import { useChain } from "../../contexts/ChainContext";

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
};

const ConnectionModal = ({
  visible,
  pendingConnection,
  wallet,
  activeChain,
  onApprove,
  onReject,
}) => {
  const { COLORS, SPACING, FONTS, BORDER_RADIUS } = useTheme();
  const { chains, switchChain } = useChain();

  if (!pendingConnection) return null;

  const { domain, url, securityInfo, requestedChainId } = pendingConnection;

  // Check if there's a chain mismatch
  const hasChainMismatch =
    requestedChainId && requestedChainId !== activeChain.id;
  const requestedChain = chains?.find((c) => c.id === requestedChainId);
  const requestedChainName =
    requestedChain?.name ||
    CHAIN_NAMES[requestedChainId] ||
    `Chain ID ${requestedChainId}`;

  const getDomainIcon = (domain) => {
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
  };

  const getRiskColor = () => {
    if (securityInfo?.isHighRisk) return COLORS.error;
    if (securityInfo?.warnings?.length > 0) return COLORS.warning;
    return COLORS.success;
  };

  const getRiskLabel = () => {
    if (securityInfo?.isHighRisk) return "High Risk";
    if (securityInfo?.warnings?.length > 0) return "Caution Advised";
    return "Verified";
  };

  const handleApprove = () => {
    if (hasChainMismatch) {
      // Show chain switch prompt
      Alert.alert(
        "Chain Mismatch",
        `This dApp expects ${requestedChainName} but you're on ${activeChain.name}.\n\nWould you like to switch chains before connecting?`,
        [
          {
            text: "Connect Anyway",
            onPress: () => onApprove(),
            style: "default",
          },
          {
            text: "Switch & Connect",
            onPress: async () => {
              if (requestedChain) {
                try {
                  await switchChain(requestedChain);
                  // Small delay to let chain switch complete
                  setTimeout(() => onApprove(), 500);
                } catch (error) {
                  console.error("Error switching chain:", error);
                  Alert.alert(
                    "Error",
                    "Failed to switch chain. Connect anyway?",
                    [
                      { text: "Cancel", style: "cancel", onPress: onReject },
                      { text: "Connect", onPress: onApprove },
                    ],
                  );
                }
              } else {
                Alert.alert(
                  "Chain Not Available",
                  `${requestedChainName} is not available in your wallet. Would you like to connect with ${activeChain.name} instead?`,
                  [
                    { text: "Cancel", style: "cancel", onPress: onReject },
                    { text: "Connect", onPress: onApprove },
                  ],
                );
              }
            },
            style: "default",
          },
          {
            text: "Cancel",
            style: "cancel",
            onPress: onReject,
          },
        ],
      );
    } else {
      onApprove();
    }
  };

  const styles = createStyles(COLORS, SPACING, FONTS, BORDER_RADIUS);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onReject}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <Text style={styles.title}>Connection Request</Text>
              <TouchableOpacity onPress={onReject} style={styles.closeButton}>
                <Ionicons name="close" size={24} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            style={styles.content}
            showsVerticalScrollIndicator={false}
          >
            {/* Site Info */}
            <View style={styles.siteCard}>
              <Image
                source={{ uri: getDomainIcon(domain) }}
                style={styles.siteIcon}
                defaultSource={require("../../assets/favicon.png")}
              />
              <View style={styles.siteInfo}>
                <Text style={styles.siteDomain}>{domain}</Text>
                <Text style={styles.siteUrl} numberOfLines={1}>
                  {url}
                </Text>
              </View>
              <View
                style={[
                  styles.riskBadge,
                  { backgroundColor: getRiskColor() + "20" },
                ]}
              >
                <Text style={[styles.riskText, { color: getRiskColor() }]}>
                  {getRiskLabel()}
                </Text>
              </View>
            </View>

            {/* Chain Mismatch Warning */}
            {hasChainMismatch && (
              <View style={styles.chainMismatchCard}>
                <View style={styles.chainMismatchHeader}>
                  <Ionicons
                    name="swap-horizontal"
                    size={20}
                    color={COLORS.warning}
                  />
                  <Text style={styles.chainMismatchTitle}>Chain Mismatch</Text>
                </View>
                <View style={styles.chainComparison}>
                  <View style={styles.chainComparisonItem}>
                    <Text style={styles.chainComparisonLabel}>You're on</Text>
                    <View style={styles.chainComparisonBadge}>
                      <Image
                        source={{ uri: activeChain.icon }}
                        style={styles.chainComparisonIcon}
                      />
                      <Text style={styles.chainComparisonName}>
                        {activeChain.name}
                      </Text>
                    </View>
                  </View>
                  <Ionicons
                    name="arrow-forward"
                    size={20}
                    color={COLORS.textTertiary}
                  />
                  <View style={styles.chainComparisonItem}>
                    <Text style={styles.chainComparisonLabel}>
                      dApp expects
                    </Text>
                    <View style={styles.chainComparisonBadge}>
                      {requestedChain?.icon && (
                        <Image
                          source={{ uri: requestedChain.icon }}
                          style={styles.chainComparisonIcon}
                        />
                      )}
                      <Text style={styles.chainComparisonName}>
                        {requestedChainName}
                      </Text>
                    </View>
                  </View>
                </View>
                <Text style={styles.chainMismatchHint}>
                  {requestedChain
                    ? "You can switch chains when you tap Connect"
                    : `${requestedChainName} is not available in your wallet`}
                </Text>
              </View>
            )}

            {/* Security Warnings */}
            {securityInfo?.warnings && securityInfo.warnings.length > 0 && (
              <View style={styles.warningsCard}>
                <View style={styles.warningHeader}>
                  <Ionicons name="warning" size={20} color={COLORS.warning} />
                  <Text style={styles.warningTitle}>Security Alerts</Text>
                </View>
                {securityInfo.warnings.map((warning, index) => (
                  <View key={index} style={styles.warningItem}>
                    <Ionicons
                      name="alert-circle-outline"
                      size={16}
                      color={COLORS.warning}
                    />
                    <Text style={styles.warningText}>{warning}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Connection Details */}
            <View style={styles.detailsCard}>
              <Text style={styles.detailsTitle}>
                This site is requesting to:
              </Text>

              <View style={styles.permissionItem}>
                <View style={styles.permissionIcon}>
                  <MaterialCommunityIcons
                    name="wallet"
                    size={20}
                    color={COLORS.primary}
                  />
                </View>
                <View style={styles.permissionInfo}>
                  <Text style={styles.permissionLabel}>
                    View wallet address
                  </Text>
                  <Text style={styles.permissionValue}>
                    {wallet.address.substring(0, 6)}...
                    {wallet.address.substring(wallet.address.length - 4)}
                  </Text>
                </View>
              </View>

              <View style={styles.permissionItem}>
                <View style={styles.permissionIcon}>
                  <MaterialCommunityIcons
                    name="link-variant"
                    size={20}
                    color={COLORS.primary}
                  />
                </View>
                <View style={styles.permissionInfo}>
                  <Text style={styles.permissionLabel}>Network</Text>
                  <View style={styles.chainBadge}>
                    <Image
                      source={{ uri: activeChain.icon }}
                      style={styles.chainIcon}
                    />
                    <Text style={styles.permissionValue}>
                      {activeChain.name}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.permissionItem}>
                <View style={styles.permissionIcon}>
                  <MaterialCommunityIcons
                    name="account-eye"
                    size={20}
                    color={COLORS.primary}
                  />
                </View>
                <View style={styles.permissionInfo}>
                  <Text style={styles.permissionLabel}>
                    View account balance
                  </Text>
                  <Text style={styles.permissionSubtext}>
                    Balance information will be visible
                  </Text>
                </View>
              </View>
            </View>

            {/* Security Notice */}
            <View style={styles.noticeCard}>
              <View style={styles.noticeIcon}>
                <MaterialCommunityIcons
                  name="shield-check"
                  size={24}
                  color={COLORS.primary}
                />
              </View>
              <View style={styles.noticeContent}>
                <Text style={styles.noticeTitle}>Stay Safe</Text>
                <Text style={styles.noticeText}>
                  • Only connect to sites you trust{"\n"}• This site can request
                  transactions{"\n"}• You'll approve each transaction{"\n"}•
                  Your private keys remain secure
                </Text>
              </View>
            </View>

            {/* Additional Warnings for High Risk */}
            {securityInfo?.isHighRisk && (
              <View style={styles.dangerCard}>
                <Ionicons name="alert-circle" size={24} color={COLORS.error} />
                <Text style={styles.dangerText}>
                  This site has been flagged as potentially dangerous.
                  Connecting may put your funds at risk. Proceed with extreme
                  caution.
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.rejectButton]}
              onPress={onReject}
            >
              <Text style={styles.rejectButtonText}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.approveButton]}
              onPress={handleApprove}
            >
              <Text style={styles.approveButtonText}>
                {hasChainMismatch ? "Connect..." : "Connect"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (COLORS, SPACING, FONTS, BORDER_RADIUS) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.8)",
      justifyContent: "flex-end",
    },
    container: {
      backgroundColor: COLORS.surface,
      borderTopLeftRadius: BORDER_RADIUS.xl,
      borderTopRightRadius: BORDER_RADIUS.xl,
      height: "90%",
    },
    header: {
      padding: SPACING.lg,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border,
    },
    headerTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    title: {
      fontSize: FONTS.sizes.xl,
      fontWeight: "bold",
      color: COLORS.text,
    },
    closeButton: {
      padding: SPACING.xs,
    },
    content: {
      flex: 1,
      padding: SPACING.lg,
    },
    siteCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: COLORS.card,
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.md,
      marginBottom: SPACING.md,
      borderWidth: 1,
      borderColor: COLORS.border,
    },
    siteIcon: {
      width: 48,
      height: 48,
      borderRadius: BORDER_RADIUS.md,
      marginRight: SPACING.sm,
    },
    siteInfo: {
      flex: 1,
    },
    siteDomain: {
      fontSize: FONTS.sizes.md,
      fontWeight: "600",
      color: COLORS.text,
      marginBottom: 4,
    },
    siteUrl: {
      fontSize: FONTS.sizes.xs,
      color: COLORS.textSecondary,
    },
    riskBadge: {
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs,
      borderRadius: BORDER_RADIUS.sm,
    },
    riskText: {
      fontSize: FONTS.sizes.xs,
      fontWeight: "600",
    },
    chainMismatchCard: {
      backgroundColor: COLORS.warning + "10",
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.md,
      marginBottom: SPACING.md,
      borderWidth: 1,
      borderColor: COLORS.warning + "30",
    },
    chainMismatchHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: SPACING.sm,
      gap: SPACING.xs,
    },
    chainMismatchTitle: {
      fontSize: FONTS.sizes.md,
      fontWeight: "600",
      color: COLORS.warning,
    },
    chainComparison: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginVertical: SPACING.sm,
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.xs,
      backgroundColor: COLORS.background + "80",
      borderRadius: BORDER_RADIUS.md,
    },
    chainComparisonItem: {
      flex: 1,
      alignItems: "center",
    },
    chainComparisonLabel: {
      fontSize: FONTS.sizes.xs,
      color: COLORS.textSecondary,
      marginBottom: SPACING.xs,
    },
    chainComparisonBadge: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: COLORS.card,
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs,
      borderRadius: BORDER_RADIUS.sm,
      gap: SPACING.xs,
    },
    chainComparisonIcon: {
      width: 16,
      height: 16,
      borderRadius: 8,
    },
    chainComparisonName: {
      fontSize: FONTS.sizes.sm,
      fontWeight: "600",
      color: COLORS.text,
    },
    chainMismatchHint: {
      fontSize: FONTS.sizes.xs,
      color: COLORS.textSecondary,
      marginTop: SPACING.xs,
      fontStyle: "italic",
      textAlign: "center",
    },
    warningsCard: {
      backgroundColor: COLORS.warning + "10",
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.md,
      marginBottom: SPACING.md,
      borderWidth: 1,
      borderColor: COLORS.warning + "30",
    },
    warningHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: SPACING.sm,
      gap: SPACING.xs,
    },
    warningTitle: {
      fontSize: FONTS.sizes.md,
      fontWeight: "600",
      color: COLORS.warning,
    },
    warningItem: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginTop: SPACING.xs,
      gap: SPACING.xs,
    },
    warningText: {
      flex: 1,
      fontSize: FONTS.sizes.sm,
      color: COLORS.text,
      lineHeight: 20,
    },
    detailsCard: {
      backgroundColor: COLORS.card,
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.md,
      marginBottom: SPACING.md,
      borderWidth: 1,
      borderColor: COLORS.border,
    },
    detailsTitle: {
      fontSize: FONTS.sizes.md,
      fontWeight: "600",
      color: COLORS.text,
      marginBottom: SPACING.md,
    },
    permissionItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: SPACING.sm,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border + "50",
    },
    permissionIcon: {
      width: 40,
      height: 40,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: COLORS.primary + "15",
      alignItems: "center",
      justifyContent: "center",
      marginRight: SPACING.sm,
    },
    permissionInfo: {
      flex: 1,
    },
    permissionLabel: {
      fontSize: FONTS.sizes.sm,
      fontWeight: "500",
      color: COLORS.text,
      marginBottom: 4,
    },
    permissionValue: {
      fontSize: FONTS.sizes.sm,
      color: COLORS.textSecondary,
      fontFamily: "monospace",
    },
    permissionSubtext: {
      fontSize: FONTS.sizes.xs,
      color: COLORS.textTertiary,
      marginTop: 2,
    },
    chainBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.xs,
    },
    chainIcon: {
      width: 16,
      height: 16,
      borderRadius: 8,
    },
    noticeCard: {
      flexDirection: "row",
      backgroundColor: COLORS.primary + "10",
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.md,
      marginBottom: SPACING.md,
      borderWidth: 1,
      borderColor: COLORS.primary + "30",
    },
    noticeIcon: {
      marginRight: SPACING.sm,
    },
    noticeContent: {
      flex: 1,
    },
    noticeTitle: {
      fontSize: FONTS.sizes.sm,
      fontWeight: "600",
      color: COLORS.primary,
      marginBottom: SPACING.xs,
    },
    noticeText: {
      fontSize: FONTS.sizes.xs,
      color: COLORS.text,
      lineHeight: 18,
    },
    dangerCard: {
      flexDirection: "row",
      backgroundColor: COLORS.error + "10",
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.md,
      marginBottom: SPACING.md,
      borderWidth: 1,
      borderColor: COLORS.error + "30",
      gap: SPACING.sm,
    },
    dangerText: {
      flex: 1,
      fontSize: FONTS.sizes.sm,
      color: COLORS.error,
      lineHeight: 20,
    },
    actions: {
      flexDirection: "row",
      padding: SPACING.lg,
      gap: SPACING.sm,
      borderTopWidth: 1,
      borderTopColor: COLORS.border,
    },
    button: {
      flex: 1,
      paddingVertical: SPACING.md,
      borderRadius: BORDER_RADIUS.lg,
      alignItems: "center",
      justifyContent: "center",
    },
    rejectButton: {
      backgroundColor: COLORS.card,
      borderWidth: 1,
      borderColor: COLORS.border,
    },
    rejectButtonText: {
      fontSize: FONTS.sizes.md,
      fontWeight: "600",
      color: COLORS.text,
    },
    approveButton: {
      backgroundColor: COLORS.primary,
    },
    approveButtonText: {
      fontSize: FONTS.sizes.md,
      fontWeight: "600",
      color: COLORS.background,
    },
  });

export default ConnectionModal;
