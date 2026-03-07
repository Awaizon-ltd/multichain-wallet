import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Image,
  Pressable,
  Modal,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useWallet } from '../../contexts/WalletContext';
import { useTheme } from '../../contexts/ThemeContext';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import { SPACING, FONTS } from '../../constants/Theme';
import { getAllNFTsAcrossChains } from '../../utils/blockchain/NFTs';
import { SUPPORTED_CHAINS } from '../../constants/Chain';
import Alert from '../../utils/Alert';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - SPACING.md * 3) / 2;

const NFTScreen = ({ navigation }) => {
  const { COLORS } = useTheme();
  const { wallet } = useWallet();
  const [nfts, setNfts] = useState([]);
  const [nftsByChain, setNftsByChain] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedNFT, setSelectedNFT] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [totalNFTCount, setTotalNFTCount] = useState(0);
  const [selectedChainFilter, setSelectedChainFilter] = useState(null);

  useEffect(() => {
    loadNFTs();
  }, [wallet]);

  const loadNFTs = async () => {
    if (!wallet?.address) return;

    try {
      setLoading(true);
      
      const result = await getAllNFTsAcrossChains(wallet.address);
      
  
      
      setNfts(result.nfts || []);
      setNftsByChain(result.byChain || []);
      setTotalNFTCount(result.totalCount || 0);
    } catch (error) {
      console.error('Error loading NFTs:', error);
      Alert.alert('Failed to load NFTs. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadNFTs();
    setRefreshing(false);
  };

  const openDetails = (nft) => {
    setSelectedNFT(nft);
    setShowDetails(true);
  };

  const getImageUrl = (nft) => {
    if (nft.image?.cachedUrl) return nft.image.cachedUrl;
    if (nft.image?.thumbnailUrl) return nft.image.thumbnailUrl;
    if (nft.image?.originalUrl) return nft.image.originalUrl;
    if (nft.media?.[0]?.gateway) return nft.media[0].gateway;
    if (nft.media?.[0]?.thumbnail) return nft.media[0].thumbnail;
    return null;
  };

  const getChainIcon = (chainId) => {
    const chain = Object.values(SUPPORTED_CHAINS).find(c => c.id === chainId);
    return chain?.icon;
  };

  const getFilteredNFTs = () => {
    if (!selectedChainFilter) return nfts;
    return nfts.filter(nft => nft.chainId === selectedChainFilter);
  };

  const filteredNFTs = getFilteredNFTs();

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
    },
    centerContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: COLORS.background,
    },
    loadingText: {
      marginTop: SPACING.md,
      fontSize: FONTS.sizes.md,
      color: COLORS.textSecondary,
    },
    scrollContent: {
      padding: SPACING.md,
    },
    header: {
      marginBottom: SPACING.xs,
    },
    title: {
      fontSize: FONTS.sizes.xl,
      fontWeight: 'bold',
      color: COLORS.text,
    },
    subtitle: {
      fontSize: FONTS.sizes.sm,
      color: COLORS.textSecondary,
      marginTop: 2,
    },
    filtersScroll: {
      marginBottom: SPACING.md,
    },
    filtersContainer: {
      gap: SPACING.xs,
      paddingRight: SPACING.md,
    },
    filterButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: COLORS.surface,
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs,
      borderRadius: 20,
      gap: 6,
    },
    filterButtonActive: {
      backgroundColor: COLORS.primary,
    },
    filterChainIcon: {
      width: 20,
      height: 20,
      borderRadius: 10,
    },
    filterButtonText: {
      fontSize: FONTS.sizes.sm,
      color: COLORS.text,
      fontWeight: '500',
    },
    filterButtonTextActive: {
      color: '#fff',
    },
    filterCountBadge: {
      backgroundColor: COLORS.background,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 10,
    },
    filterCountBadgeActive: {
      backgroundColor: 'rgba(255,255,255,0.2)',
    },
    filterCountText: {
      fontSize: FONTS.sizes.xs,
      color: COLORS.text,
      fontWeight: '600',
    },
    filterCountTextActive: {
      color: '#fff',
    },
    nftsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm,
    },
    nftCard: {
      width: CARD_WIDTH,
      backgroundColor: COLORS.surface,
      borderRadius: 12,
      overflow: 'hidden',
      position: 'relative',
    },
    nftImage: {
      width: '100%',
      height: CARD_WIDTH,
      backgroundColor: COLORS.background,
    },
    nftImagePlaceholder: {
      width: '100%',
      height: CARD_WIDTH,
      backgroundColor: COLORS.background,
      justifyContent: 'center',
      alignItems: 'center',
    },
    chainBadge: {
      position: 'absolute',
      top: 8,
      right: 8,
      backgroundColor: COLORS.surface,
      borderRadius: 12,
      padding: 4,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    chainIcon: {
      width: 20,
      height: 20,
      borderRadius: 10,
    },
    nftInfo: {
      padding: SPACING.sm,
    },
    nftName: {
      fontSize: FONTS.sizes.sm,
      fontWeight: '600',
      color: COLORS.text,
      marginBottom: 2,
    },
    nftCollection: {
      fontSize: FONTS.sizes.xs,
      color: COLORS.textSecondary,
    },
    nftChain: {
      fontSize: FONTS.sizes.xs - 2,
      color: COLORS.textTertiary,
      marginTop: 2,
    },
    emptyCard: {
      padding: SPACING.xl,
      alignItems: 'center',
    },
    emptyText: {
      fontSize: FONTS.sizes.lg,
      fontWeight: '600',
      color: COLORS.textSecondary,
      marginTop: SPACING.md,
    },
    emptySubtext: {
      fontSize: FONTS.sizes.sm,
      color: COLORS.textTertiary,
      marginTop: 4,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: COLORS.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: '90%',
      paddingBottom: SPACING.md,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: SPACING.md,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border,
    },
    modalHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    modalTitle: {
      fontSize: FONTS.sizes.lg,
      fontWeight: 'bold',
      color: COLORS.text,
    },
    modalChainIcon: {
      width: 24,
      height: 24,
      borderRadius: 12,
    },
    closeButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: COLORS.background,
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalImage: {
      width: '100%',
      height: 300,
      backgroundColor: COLORS.background,
    },
    modalImagePlaceholder: {
      width: '100%',
      height: 300,
      backgroundColor: COLORS.background,
      justifyContent: 'center',
      alignItems: 'center',
    },
    detailsSection: {
      padding: SPACING.md,
    },
    detailsName: {
      fontSize: FONTS.sizes.xl,
      fontWeight: 'bold',
      color: COLORS.text,
      marginBottom: 4,
    },
    detailsCollection: {
      fontSize: FONTS.sizes.md,
      color: COLORS.primary,
      fontWeight: '600',
    },
    detailsChain: {
      fontSize: FONTS.sizes.sm,
      color: COLORS.textSecondary,
      marginBottom: SPACING.md,
    },
    detailsBlock: {
      marginBottom: SPACING.md,
    },
    detailsLabel: {
      fontSize: FONTS.sizes.xs,
      color: COLORS.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    detailsText: {
      fontSize: FONTS.sizes.md,
      color: COLORS.text,
      lineHeight: 20,
    },
    attributesGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm,
      marginTop: SPACING.sm,
    },
    attributeCard: {
      backgroundColor: COLORS.background,
      padding: SPACING.sm,
      borderRadius: 8,
      minWidth: 100,
    },
    attributeType: {
      fontSize: FONTS.sizes.xs,
      color: COLORS.textSecondary,
      marginBottom: 2,
    },
    attributeValue: {
      fontSize: FONTS.sizes.sm,
      color: COLORS.text,
      fontWeight: '600',
    },
    modalButton: {
      marginHorizontal: SPACING.md,
      marginTop: SPACING.sm,
    },
  });

  const NFTCard = ({ nft }) => {
    const imageUrl = getImageUrl(nft);
    const chainIcon = getChainIcon(nft.chainId);
    
    return (
      <Pressable
        style={styles.nftCard}
        onPress={() => navigation.navigate('NFTDetail', { nft })}
      >
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.nftImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.nftImagePlaceholder}>
            <Ionicons name="image-outline" size={40} color={COLORS.textTertiary} />
          </View>
        )}
        
        {chainIcon && (
          <View style={styles.chainBadge}>
            <Image source={{ uri: chainIcon }} style={styles.chainIcon} />
          </View>
        )}
        
        <View style={styles.nftInfo}>
          <Text style={styles.nftName} numberOfLines={1}>
            {nft.name || nft.title || `#${nft.tokenId}`}
          </Text>
          <Text style={styles.nftCollection} numberOfLines={1}>
            {nft.contract?.name || nft.contract?.symbol || 'Unknown'}
          </Text>
          <Text style={styles.nftChain} numberOfLines={1}>
            {nft.chainName}
          </Text>
        </View>
      </Pressable>
    );
  };

  const ChainFilterButton = ({ chain, count }) => {
    const isSelected = selectedChainFilter === chain?.id;
    const isAll = !chain;
    
    return (
      <Pressable
        style={[
          styles.filterButton,
          (isAll && !selectedChainFilter) || isSelected ? styles.filterButtonActive : null
        ]}
        onPress={() => setSelectedChainFilter(chain?.id || null)}
      >
        {chain?.icon && (
          <Image source={{ uri: chain.icon }} style={styles.filterChainIcon} />
        )}
        <Text
          style={[
            styles.filterButtonText,
            (isAll && !selectedChainFilter) || isSelected ? styles.filterButtonTextActive : null
          ]}
        >
          {chain?.name || 'All Chains'}
        </Text>
        <View
          style={[
            styles.filterCountBadge,
            (isAll && !selectedChainFilter) || isSelected ? styles.filterCountBadgeActive : null
          ]}
        >
          <Text
            style={[
              styles.filterCountText,
              (isAll && !selectedChainFilter) || isSelected ? styles.filterCountTextActive : null
            ]}
          >
            {count}
          </Text>
        </View>
      </Pressable>
    );
  };

  const NFTDetailsModal = () => {
    if (!selectedNFT) return null;

    const imageUrl = getImageUrl(selectedNFT);
    const attributes = selectedNFT.raw?.metadata?.attributes || [];
    const chainIcon = getChainIcon(selectedNFT.chainId);

    return (
      <Modal
        visible={showDetails}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowDetails(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderLeft}>
                  <Text style={styles.modalTitle}>NFT Details</Text>
                  {chainIcon && (
                    <Image source={{ uri: chainIcon }} style={styles.modalChainIcon} />
                  )}
                </View>
                <Pressable
                  onPress={() => setShowDetails(false)}
                  style={styles.closeButton}
                >
                  <Ionicons name="close" size={24} color={COLORS.text} />
                </Pressable>
              </View>

              {imageUrl ? (
                <Image
                  source={{ uri: imageUrl }}
                  style={styles.modalImage}
                  resizeMode="contain"
                />
              ) : (
                <View style={styles.modalImagePlaceholder}>
                  <Ionicons name="image-outline" size={80} color={COLORS.textTertiary} />
                </View>
              )}

              <View style={styles.detailsSection}>
                <Text style={styles.detailsName}>
                  {selectedNFT.name || selectedNFT.title || `Token #${selectedNFT.tokenId}`}
                </Text>
                <Text style={styles.detailsCollection}>
                  {selectedNFT.contract?.name}
                </Text>
                <Text style={styles.detailsChain}>
                  {selectedNFT.chainName}
                </Text>

                {selectedNFT.description && (
                  <View style={styles.detailsBlock}>
                    <Text style={styles.detailsLabel}>Description</Text>
                    <Text style={styles.detailsText}>{selectedNFT.description}</Text>
                  </View>
                )}

                <View style={styles.detailsBlock}>
                  <Text style={styles.detailsLabel}>Token ID</Text>
                  <Text style={styles.detailsText}>{selectedNFT.tokenId}</Text>
                </View>

                <View style={styles.detailsBlock}>
                  <Text style={styles.detailsLabel}>Contract Address</Text>
                  <Text style={styles.detailsText} numberOfLines={1}>
                    {selectedNFT.contract?.address}
                  </Text>
                </View>

                <View style={styles.detailsBlock}>
                  <Text style={styles.detailsLabel}>Token Type</Text>
                  <Text style={styles.detailsText}>
                    {selectedNFT.tokenType || selectedNFT.contract?.tokenType}
                  </Text>
                </View>

                {attributes.length > 0 && (
                  <View style={styles.detailsBlock}>
                    <Text style={styles.detailsLabel}>Attributes</Text>
                    <View style={styles.attributesGrid}>
                      {attributes.map((attr, index) => (
                        <View key={index} style={styles.attributeCard}>
                          <Text style={styles.attributeType}>{attr.trait_type}</Text>
                          <Text style={styles.attributeValue}>{attr.value}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            </ScrollView>

            <Button
              title="Close"
              onPress={() => setShowDetails(false)}
              variant="primary"
              fullWidth
              style={styles.modalButton}
            />
          </View>
        </View>
      </Modal>
    );
  };

  if (loading && nfts.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading NFTs from all chains...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.subtitle}>
              {totalNFTCount} {totalNFTCount === 1 ? 'item' : 'items'} across all chains
            </Text>
          </View>
        </View>

        {nftsByChain.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filtersContainer}
            style={styles.filtersScroll}
          >
            <ChainFilterButton count={totalNFTCount} />
            {nftsByChain.map((chainData) => (
              <ChainFilterButton
                key={chainData.chain.id}
                chain={chainData.chain}
                count={chainData.totalCount}
              />
            ))}
          </ScrollView>
        )}

        {filteredNFTs.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Ionicons name="images-outline" size={64} color={COLORS.textTertiary} />
            <Text style={styles.emptyText}>
              {selectedChainFilter ? 'No NFTs on this chain' : 'No NFTs found'}
            </Text>
            <Text style={styles.emptySubtext}>
              NFTs you own will appear here
            </Text>
          </Card>
        ) : (
          <View style={styles.nftsGrid}>
            {filteredNFTs.map((nft, index) => (
              <NFTCard key={`${nft.contract?.address}-${nft.tokenId}-${index}`} nft={nft} />
            ))}
          </View>
        )}
      </ScrollView>

      <NFTDetailsModal />
    </View>
  );
};

export default NFTScreen;