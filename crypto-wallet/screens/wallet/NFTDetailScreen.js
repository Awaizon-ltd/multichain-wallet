import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Pressable,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext'; // Adjust path as needed
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import { SUPPORTED_CHAINS } from '../../constants/Chain';
import { formatAddress } from '../../utils/Wallet';
import * as Clipboard from 'expo-clipboard';
import Alert from '../../utils/Alert';

const NFTDetailScreen = ({ route, navigation }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { nft } = route.params;

  const getImageUrl = (nft) => {
    if (nft.image?.cachedUrl) return nft.image.cachedUrl;
    if (nft.image?.thumbnailUrl) return nft.image.thumbnailUrl;
    if (nft.image?.originalUrl) return nft.image.originalUrl;
    if (nft.media?.[0]?.gateway) return nft.media[0].gateway;
    if (nft.media?.[0]?.thumbnail) return nft.media[0].thumbnail;
    return null;
  };

  const getChain = () => {
    return Object.values(SUPPORTED_CHAINS).find((c) => c.id === nft.chainId);
  };

  const imageUrl = getImageUrl(nft);
  const chain = getChain();
  const attributes = nft.raw?.metadata?.attributes || [];

  const openInExplorer = () => {
    if (chain && nft.contract?.address) {
      const url = `${chain.explorer}/token/${nft.contract.address}?a=${nft.tokenId}`;
      Linking.openURL(url).catch((err) =>
        console.error('Failed to open explorer:', err)
      );
    }
  };

  const copyContractAddress = async () => {
    if (nft.contract?.address) {
      await Clipboard.setStringAsync(nft.contract.address);
      Alert.alert('Contract address copied!');
    }
  };

  const handleSend = () => {
    navigation.navigate('NFTSend', {
      nft,
      chain,
    });
  };

  const InfoRow = ({ label, value, onPress }) => (
    <Pressable style={styles.infoRow} onPress={onPress} disabled={!onPress}>
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={styles.infoValueContainer}>
        <Text style={styles.infoValue} numberOfLines={1}>
          {value}
        </Text>
        {onPress && (
          <Ionicons name="copy-outline" size={16} color={theme.COLORS.primary} />
        )}
      </View>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color={theme.COLORS.text} />
          </Pressable>
          <Text style={styles.headerTitle}>NFT Details</Text>
          <Pressable onPress={openInExplorer} style={styles.explorerButton}>
            <Ionicons name="open-outline" size={24} color={theme.COLORS.text} />
          </Pressable>
        </View>

        {/* Image */}
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.image}
            resizeMode="contain"
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons
              name="image-outline"
              size={80}
              color={theme.COLORS.textTertiary}
            />
          </View>
        )}

        {/* Main Info */}
        <View style={styles.content}>
          <View style={styles.titleSection}>
            <Text style={styles.name}>
              {nft.name || nft.title || `Token #${nft.tokenId}`}
            </Text>
            <Text style={styles.collection}>{nft.contract?.name}</Text>
            {chain && (
              <View style={styles.chainBadge}>
                <Image source={{ uri: chain.icon }} style={styles.chainIcon} />
                <Text style={styles.chainName}>{chain.name}</Text>
              </View>
            )}
          </View>

          {/* Description */}
          {nft.description && (
            <Card style={styles.descriptionCard}>
              <Text style={styles.sectionTitle}>Description</Text>
              <Text style={styles.description}>{nft.description}</Text>
            </Card>
          )}

          {/* Details */}
          <Card style={styles.detailsCard}>
            <Text style={styles.sectionTitle}>Details</Text>

            <InfoRow label="Contract Address" value={formatAddress(nft.contract?.address, 6)} onPress={copyContractAddress} />
            <InfoRow label="Token ID" value={nft.tokenId} />
            <InfoRow
              label="Token Standard"
              value={nft.tokenType || nft.contract?.tokenType || 'ERC-721'}
            />
            {chain && <InfoRow label="Network" value={chain.name} />}
          </Card>

          {/* Attributes */}
          {attributes.length > 0 && (
            <Card style={styles.attributesCard}>
              <Text style={styles.sectionTitle}>Attributes</Text>
              <View style={styles.attributesGrid}>
                {attributes.map((attr, index) => (
                  <View key={index} style={styles.attributeItem}>
                    <Text style={styles.attributeType}>{attr.trait_type}</Text>
                    <Text style={styles.attributeValue}>{attr.value}</Text>
                    {attr.rarity && (
                      <Text style={styles.attributeRarity}>
                        {attr.rarity}% have this trait
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            </Card>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            <Button
              title="Send NFT"
              onPress={handleSend}
              icon="send-outline"
              fullWidth
              style={styles.sendButton}
            />
            <Button
              title="View on Explorer"
              onPress={openInExplorer}
              variant="outline"
              icon="open-outline"
              fullWidth
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const createStyles = (theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.COLORS.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: theme.SPACING.md,
      paddingTop: theme.SPACING.lg,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.COLORS.surface,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: theme.FONTS.sizes.lg,
      fontWeight: 'bold',
      color: theme.COLORS.text,
    },
    explorerButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.COLORS.surface,
      justifyContent: 'center',
      alignItems: 'center',
    },
    image: {
      width: '100%',
      height: 400,
      backgroundColor: theme.COLORS.surface,
    },
    imagePlaceholder: {
      width: '100%',
      height: 400,
      backgroundColor: theme.COLORS.surface,
      justifyContent: 'center',
      alignItems: 'center',
    },
    content: {
      padding: theme.SPACING.md,
    },
    titleSection: {
      marginBottom: theme.SPACING.md,
    },
    name: {
      fontSize: theme.FONTS.sizes.xxl,
      fontWeight: 'bold',
      color: theme.COLORS.text,
      marginBottom: 4,
    },
    collection: {
      fontSize: theme.FONTS.sizes.lg,
      color: theme.COLORS.primary,
      fontWeight: '600',
      marginBottom: theme.SPACING.sm,
    },
    chainBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.COLORS.surface,
      paddingHorizontal: theme.SPACING.sm,
      paddingVertical: theme.SPACING.xs,
      borderRadius: 20,
      alignSelf: 'flex-start',
      gap: 6,
      borderWidth: 1,
      borderColor: theme.COLORS.border,
    },
    chainIcon: {
      width: 20,
      height: 20,
      borderRadius: 10,
    },
    chainName: {
      fontSize: theme.FONTS.sizes.sm,
      color: theme.COLORS.text,
      fontWeight: '500',
    },
    descriptionCard: {
      padding: theme.SPACING.md,
      marginBottom: theme.SPACING.md,
    },
    sectionTitle: {
      fontSize: theme.FONTS.sizes.md,
      fontWeight: 'bold',
      color: theme.COLORS.text,
      marginBottom: theme.SPACING.sm,
    },
    description: {
      fontSize: theme.FONTS.sizes.sm,
      color: theme.COLORS.textSecondary,
      lineHeight: 20,
    },
    detailsCard: {
      padding: theme.SPACING.md,
      marginBottom: theme.SPACING.md,
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: theme.SPACING.sm,
      borderBottomWidth: 1,
      borderBottomColor: theme.COLORS.border,
    },
    infoLabel: {
      fontSize: theme.FONTS.sizes.sm,
      color: theme.COLORS.textSecondary,
    },
    infoValueContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      maxWidth: '60%',
    },
    infoValue: {
      fontSize: theme.FONTS.sizes.sm,
      color: theme.COLORS.text,
      fontWeight: '500',
    },
    attributesCard: {
      padding: theme.SPACING.md,
      marginBottom: theme.SPACING.md,
    },
    attributesGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.SPACING.sm,
    },
    attributeItem: {
      backgroundColor: theme.COLORS.background,
      padding: theme.SPACING.sm,
      borderRadius: 12,
      minWidth: '48%',
      flex: 1,
      borderWidth: 1,
      borderColor: theme.COLORS.border,
    },
    attributeType: {
      fontSize: theme.FONTS.sizes.xs,
      color: theme.COLORS.textSecondary,
      textTransform: 'uppercase',
      marginBottom: 2,
    },
    attributeValue: {
      fontSize: theme.FONTS.sizes.md,
      color: theme.COLORS.text,
      fontWeight: '600',
    },
    attributeRarity: {
      fontSize: theme.FONTS.sizes.xs,
      color: theme.COLORS.primary,
      marginTop: 2,
    },
    actions: {
      marginTop: theme.SPACING.md,
      gap: theme.SPACING.sm,
    },
    sendButton: {
      marginBottom: theme.SPACING.xs,
    },
  });

export default NFTDetailScreen;