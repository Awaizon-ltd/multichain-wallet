import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useWallet } from "../../contexts/WalletContext";
import { useTheme } from "../../contexts/ThemeContext";
import Button from "../../components/common/Button";
import Input from "../../components/common/Input";
import Card from "../../components/common/Card";
import ChainSwitcher from "../../components/wallet/ChainSwitcher";
import NFTImage from "../../components/common/NFTImage";
import { verifyAndFetchNFT, clearNFTCache } from "../../utils/blockchain/NFTs";
import { saveNft, nftExists } from "../../utils/NftDatabase";
import { validateAddress } from "../../utils/Validators";
import Alert from "../../utils/Alert";

const NFTImportScreen = ({ navigation }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { selectedChain, wallet } = useWallet();

  const [contractAddress, setContractAddress] = useState("");
  const [tokenId, setTokenId] = useState("");
  const [loading, setLoading] = useState(false);
  const [nft, setNft] = useState(null);
  const [error, setError] = useState("");
  const [showChainSwitcher, setShowChainSwitcher] = useState(false);

  const resetPreview = () => {
    setNft(null);
    setError("");
  };

  const handleFetch = async () => {
    setError("");
    setNft(null);

    const addressValidation = validateAddress(contractAddress);
    if (!addressValidation.isValid) {
      setError("Invalid contract address");
      return;
    }
    if (!tokenId.trim() || !/^\d+$/.test(tokenId.trim())) {
      setError("Token ID must be a number");
      return;
    }
    if (!wallet?.address) {
      setError("No wallet connected");
      return;
    }

    try {
      setLoading(true);
      const found = await verifyAndFetchNFT(
        contractAddress,
        tokenId.trim(),
        selectedChain,
        wallet.address,
      );
      setNft(found);
    } catch (err) {
      setError(err.message || "Couldn't find that NFT");
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!nft || !wallet?.address) return;

    try {
      setLoading(true);
      const userAddress = wallet.address.toLowerCase();
      const chainId = parseInt(selectedChain.id);

      const alreadyImported = await nftExists(
        userAddress,
        chainId,
        nft.contract.address,
        nft.tokenId,
      );
      if (alreadyImported) {
        Alert.alert("Already Added", "This NFT is already in your wallet.", [
          { text: "OK", onPress: () => navigation.goBack() },
        ]);
        return;
      }

      await saveNft(userAddress, chainId, {
        address: nft.contract.address,
        tokenId: nft.tokenId,
        tokenType: nft.tokenType,
        name: nft.title,
        image: nft.media?.[0]?.gateway || null,
      });

      // The 5-minute NFT cache would otherwise hide this until it expires.
      clearNFTCache();

      Alert.alert("Success! 🎉", `${nft.title} has been added to your wallet`, [
        { text: "Done", onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert("Error", `Failed to import NFT: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

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
        <View style={styles.header}>
          <Ionicons name="add-circle" size={32} color={theme.COLORS.primary} />
          <Text style={styles.title}>Import NFT</Text>
        </View>

        <TouchableOpacity
          style={styles.networkSelector}
          onPress={() => setShowChainSwitcher(true)}
          activeOpacity={0.7}
        >
          <Image
            source={{ uri: selectedChain.icon }}
            style={styles.networkIcon}
            resizeMode="contain"
          />
          <Text style={styles.networkName}>{selectedChain.name}</Text>
          <Ionicons name="chevron-down" size={18} color={theme.COLORS.textSecondary} />
        </TouchableOpacity>

        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>Contract Address</Text>
          <Input
            value={contractAddress}
            onChangeText={(v) => {
              setContractAddress(v);
              resetPreview();
            }}
            placeholder="0x..."
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>Token ID</Text>
          <View style={styles.inputRow}>
            <Input
              value={tokenId}
              onChangeText={(v) => {
                setTokenId(v);
                resetPreview();
              }}
              placeholder="1"
              keyboardType="number-pad"
              error={error}
              style={styles.input}
            />
            <Button
              title={loading ? "..." : "Fetch"}
              onPress={handleFetch}
              loading={loading}
              disabled={!contractAddress || !tokenId || loading}
              style={styles.fetchButton}
            />
          </View>
        </View>

        {nft && (
          <Card style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <NFTImage nft={nft} style={styles.previewImage} />
              <View style={styles.previewInfo}>
                <Text style={styles.previewName} numberOfLines={2}>
                  {nft.title}
                </Text>
                <Text style={styles.previewCollection} numberOfLines={1}>
                  {nft.contract?.name || "Unknown collection"}
                </Text>
                <Text style={styles.previewType}>{nft.tokenType}</Text>
              </View>
              <Ionicons
                name="checkmark-circle"
                size={24}
                color={theme.COLORS.success}
              />
            </View>

            <Button
              title="Import NFT"
              onPress={handleImport}
              loading={loading}
              fullWidth
              style={styles.importButton}
            />
          </Card>
        )}

        <View style={styles.warning}>
          <Ionicons
            name="shield-checkmark-outline"
            size={16}
            color={theme.COLORS.warning}
          />
          <Text style={styles.warningText}>
            Only import NFTs from trusted sources. This confirms the wallet
            currently owns the token before adding it.
          </Text>
        </View>
      </ScrollView>

      <ChainSwitcher
        visible={showChainSwitcher}
        onClose={() => setShowChainSwitcher(false)}
        currentChain={selectedChain}
        onSelectChain={() => {
          setShowChainSwitcher(false);
          resetPreview();
          setContractAddress("");
          setTokenId("");
        }}
      />
    </KeyboardAvoidingView>
  );
};

const createStyles = (theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.COLORS.background },
    content: { padding: 16, paddingBottom: 24 },
    header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
    title: { fontSize: 20, fontWeight: "700", color: theme.COLORS.text },
    networkSelector: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.COLORS.surface,
      borderRadius: 12,
      padding: 12,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: theme.COLORS.border,
    },
    networkIcon: { width: 28, height: 28, borderRadius: 14, marginRight: 10 },
    networkName: { flex: 1, fontSize: 15, fontWeight: "600", color: theme.COLORS.text },
    inputSection: { marginBottom: 16 },
    inputLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: theme.COLORS.textSecondary,
      marginBottom: 8,
    },
    inputRow: { flexDirection: "row", gap: 8 },
    input: { flex: 1 },
    fetchButton: { width: 80, height: 48 },
    previewCard: {
      padding: 14,
      marginBottom: 16,
      borderWidth: 1.5,
      borderColor: theme.COLORS.success,
      backgroundColor: theme.COLORS.surface,
    },
    previewHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginBottom: 12,
    },
    previewImage: {
      width: 56,
      height: 56,
      borderRadius: 10,
      backgroundColor: theme.COLORS.background,
    },
    previewInfo: { flex: 1 },
    previewName: { fontSize: 15, fontWeight: "700", color: theme.COLORS.text },
    previewCollection: {
      fontSize: 13,
      color: theme.COLORS.textSecondary,
      marginTop: 2,
    },
    previewType: { fontSize: 11, color: theme.COLORS.primary, marginTop: 2 },
    importButton: { marginTop: 4 },
    warning: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      padding: 12,
      backgroundColor: theme.COLORS.surface,
      borderRadius: 8,
      borderLeftWidth: 3,
      borderLeftColor: theme.COLORS.warning,
    },
    warningText: {
      flex: 1,
      fontSize: 11,
      color: theme.COLORS.textSecondary,
      lineHeight: 16,
    },
  });

export default NFTImportScreen;
