// utils/helpers.js
import { Linking, Share, Platform, Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';

// ============================================================================
// DEEP LINKING CONFIGURATION
// ============================================================================

export const DeepLinks = {
  // Base configuration
  PREFIX: 'nexussysfi://',
  WEB_PREFIX: 'https://sysfidao.com',

  // Generate app deep links
  invite: (inviteCode) => `nexussysfi://invite/${inviteCode}`,
  
  guild: (guildId) => `nexussysfi://guild/${guildId}`,
  
  dao: (daoAddress, genre = null) => 
    genre ? `nexussysfi://dao/${daoAddress}/${genre}` : `nexussysfi://dao/${daoAddress}`,
  
  proposal: (proposalId) => `nexussysfi://proposal/${proposalId}`,
  
  profile: (userId) => `nexussysfi://profile/${userId}`,
  
  token: (tokenAddress) => `nexussysfi://token/${tokenAddress}`,
  
  nft: (contractAddress, tokenId) => `nexussysfi://nft/${contractAddress}/${tokenId}`,
  
  send: (tokenAddress, toAddress = null, amount = null) => {
    let link = `nexussysfi://wallet/send/${tokenAddress}`;
    if (toAddress) link += `/${toAddress}`;
    if (amount) link += `?amount=${amount}`;
    return link;
  },

  // Generate web links (for universal links/SEO)
  web: {
    invite: (inviteCode) => `https://sysfidao.com/invite/${inviteCode}`,
    guild: (guildId) => `https://sysfidao.com/guild/${guildId}`,
    dao: (daoAddress, genre = null) => 
      genre ? `https://sysfidao.com/dao/${daoAddress}/${genre}` : `https://sysfidao.com/dao/${daoAddress}`,
    proposal: (proposalId) => `https://sysfidao.com/proposal/${proposalId}`,
    profile: (userId) => `https://sysfidao.com/profile/${userId}`,
  },
};

// ============================================================================
// SHARING FUNCTIONS
// ============================================================================

/**
 * Share DAO with others
 */
export const shareDAO = async (daoAddress, chainId, daoName, daoGenre = null) => {
  try {
    const deepLink = DeepLinks.dao(daoAddress, daoGenre);
    const webLink = DeepLinks.web.dao(daoAddress, daoGenre);
    
    const message = `Check out ${daoName} on NexusSysFi!\n\n${Platform.OS === 'web' ? webLink : deepLink}`;

    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      const result = await Share.share({
        message: message,
        title: `Join ${daoName}`,
        url: Platform.OS === 'ios' ? deepLink : undefined,
      });

      if (result.action === Share.sharedAction) {
        console.log('DAO shared successfully');
      }
    } else {
      // Web fallback - copy to clipboard
      await Clipboard.setStringAsync(webLink);
      Alert.alert('Link Copied!', 'The DAO link has been copied to your clipboard.');
    }
  } catch (error) {
    console.error('Error sharing DAO:', error);
    
    // Fallback to clipboard
    try {
      const fallbackLink = DeepLinks.dao(daoAddress, daoGenre);
      await Clipboard.setStringAsync(fallbackLink);
      Alert.alert('Link Copied', 'Unable to share, but the link has been copied to your clipboard.');
    } catch (clipboardError) {
      Alert.alert('Error', 'Unable to share DAO. Please try again.');
    }
  }
};

/**
 * Share Guild invite
 */
export const shareGuildInvite = async (inviteCode, guildName) => {
  try {
    const deepLink = DeepLinks.invite(inviteCode);
    const webLink = DeepLinks.web.invite(inviteCode);
    
    const message = `Join ${guildName} on NexusSysFi!\n\n${Platform.OS === 'web' ? webLink : deepLink}`;

    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      await Share.share({
        message: message,
        title: `Join ${guildName}`,
        url: Platform.OS === 'ios' ? deepLink : undefined,
      });
    } else {
      await Clipboard.setStringAsync(webLink);
      Alert.alert('Link Copied!', 'The invite link has been copied to your clipboard.');
    }
  } catch (error) {
    console.error('Error sharing invite:', error);
    Alert.alert('Error', 'Unable to share invite. Please try again.');
  }
};

/**
 * Share Guild
 */
export const shareGuild = async (guildId, guildName) => {
  try {
    const deepLink = DeepLinks.guild(guildId);
    const webLink = DeepLinks.web.guild(guildId);
    
    const message = `Check out ${guildName} on NexusSysFi!\n\n${Platform.OS === 'web' ? webLink : deepLink}`;

    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      await Share.share({
        message: message,
        title: guildName,
        url: Platform.OS === 'ios' ? deepLink : undefined,
      });
    } else {
      await Clipboard.setStringAsync(webLink);
      Alert.alert('Link Copied!', 'The guild link has been copied to your clipboard.');
    }
  } catch (error) {
    console.error('Error sharing guild:', error);
    Alert.alert('Error', 'Unable to share guild. Please try again.');
  }
};

/**
 * Share user profile
 */
export const shareProfile = async (userId, username) => {
  try {
    const deepLink = DeepLinks.profile(userId);
    const webLink = DeepLinks.web.profile(userId);
    
    const message = `Check out ${username}'s profile on NexusSysFi!\n\n${Platform.OS === 'web' ? webLink : deepLink}`;

    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      await Share.share({
        message: message,
        title: `${username}'s Profile`,
        url: Platform.OS === 'ios' ? deepLink : undefined,
      });
    } else {
      await Clipboard.setStringAsync(webLink);
      Alert.alert('Link Copied!', 'The profile link has been copied to your clipboard.');
    }
  } catch (error) {
    console.error('Error sharing profile:', error);
    Alert.alert('Error', 'Unable to share profile. Please try again.');
  }
};

/**
 * Share Proposal
 */
export const shareProposal = async (proposalId, proposalTitle) => {
  try {
    const deepLink = DeepLinks.proposal(proposalId);
    const webLink = DeepLinks.web.proposal(proposalId);
    
    const message = `Vote on "${proposalTitle}" on NexusSysFi!\n\n${Platform.OS === 'web' ? webLink : deepLink}`;

    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      await Share.share({
        message: message,
        title: proposalTitle,
        url: Platform.OS === 'ios' ? deepLink : undefined,
      });
    } else {
      await Clipboard.setStringAsync(webLink);
      Alert.alert('Link Copied!', 'The proposal link has been copied to your clipboard.');
    }
  } catch (error) {
    console.error('Error sharing proposal:', error);
    Alert.alert('Error', 'Unable to share proposal. Please try again.');
  }
};

/**
 * Create payment request link
 */
export const createPaymentRequest = async (tokenAddress, toAddress, amount = null) => {
  try {
    const deepLink = DeepLinks.send(tokenAddress, toAddress, amount);
    
    await Clipboard.setStringAsync(deepLink);
    Alert.alert('Payment Request Created', 'The payment request link has been copied to your clipboard.');
    
    return deepLink;
  } catch (error) {
    console.error('Error creating payment request:', error);
    Alert.alert('Error', 'Unable to create payment request.');
    return null;
  }
};

/**
 * Share Token
 */
export const shareToken = async (tokenAddress, tokenSymbol) => {
  try {
    const deepLink = DeepLinks.token(tokenAddress);
    const message = `Check out ${tokenSymbol} on NexusSysFi!\n\n${deepLink}`;

    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      await Share.share({
        message: message,
        title: tokenSymbol,
        url: Platform.OS === 'ios' ? deepLink : undefined,
      });
    } else {
      await Clipboard.setStringAsync(deepLink);
      Alert.alert('Link Copied!', 'The token link has been copied to your clipboard.');
    }
  } catch (error) {
    console.error('Error sharing token:', error);
    Alert.alert('Error', 'Unable to share token.');
  }
};

/**
 * Share NFT
 */
export const shareNFT = async (contractAddress, tokenId, nftName) => {
  try {
    const deepLink = DeepLinks.nft(contractAddress, tokenId);
    const message = `Check out ${nftName} on NexusSysFi!\n\n${deepLink}`;

    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      await Share.share({
        message: message,
        title: nftName,
        url: Platform.OS === 'ios' ? deepLink : undefined,
      });
    } else {
      await Clipboard.setStringAsync(deepLink);
      Alert.alert('Link Copied!', 'The NFT link has been copied to your clipboard.');
    }
  } catch (error) {
    console.error('Error sharing NFT:', error);
    Alert.alert('Error', 'Unable to share NFT.');
  }
};

// ============================================================================
// FORMATTING FUNCTIONS
// ============================================================================

/**
 * Format address for display (0x1234...5678)
 */
export const formatAddress = (address, startChars = 6, endChars = 4) => {
  if (!address) return 'N/A';
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
};

/**
 * Copy text to clipboard
 */
export const copyToClipboard = async (text, successMessage = 'Copied!') => {
  try {
    await Clipboard.setStringAsync(text);
    return true;
  } catch (error) {
    console.error('Copy failed:', error);
    return false;
  }
};

/**
 * Format time ago (e.g., "2 hours ago")
 */
export const formatTimeAgo = (timestamp) => {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 2592000) return `${Math.floor(diff / 604800)}w ago`;
  return `${Math.floor(diff / 2592000)}mo ago`;
};

/**
 * Format number with commas
 */
export const formatNumber = (num, decimals = 2) => {
  const number = parseFloat(num);
  if (isNaN(number)) return '0';
  
  return number.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
};

/**
 * Calculate voting progress percentage
 */
export const calculateVotePercentage = (votes, totalVotes) => {
  if (!totalVotes || totalVotes === '0') return 0;
  const percentage = (parseFloat(votes) / parseFloat(totalVotes)) * 100;
  return Math.min(percentage, 100);
};

/**
 * Format voting period remaining
 */
export const formatTimeRemaining = (endTimestamp) => {
  const now = Math.floor(Date.now() / 1000);
  const remaining = endTimestamp - now;
  
  if (remaining <= 0) return 'Ended';
  
  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  return `${minutes}m remaining`;
};

// ============================================================================
// EXPLORER FUNCTIONS
// ============================================================================

/**
 * Open block explorer for address
 */
export const openExplorer = async (explorerUrl, address) => {
  try {
    const url = `${explorerUrl}/address/${address}`;
    const supported = await Linking.canOpenURL(url);
    
    if (supported) {
      await Linking.openURL(url);
    } else {
      console.error('Cannot open URL:', url);
    }
  } catch (error) {
    console.error('Error opening explorer:', error);
  }
};

/**
 * Open transaction in explorer
 */
export const openTransaction = async (explorerUrl, txHash) => {
  try {
    const url = `${explorerUrl}/tx/${txHash}`;
    const supported = await Linking.canOpenURL(url);
    
    if (supported) {
      await Linking.openURL(url);
    }
  } catch (error) {
    console.error('Error opening transaction:', error);
  }
};

/**
 * Open contract in explorer
 */
export const openContract = async (explorerUrl, contractAddress) => {
  try {
    const url = `${explorerUrl}/address/${contractAddress}`;
    const supported = await Linking.canOpenURL(url);
    
    if (supported) {
      await Linking.openURL(url);
    }
  } catch (error) {
    console.error('Error opening contract:', error);
  }
};

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate Ethereum address
 */
export const isValidAddress = (address) => {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
};

/**
 * Validate transaction hash
 */
export const isValidTxHash = (hash) => {
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
};

/**
 * Validate amount (must be positive number)
 */
export const isValidAmount = (amount) => {
  const num = parseFloat(amount);
  return !isNaN(num) && num > 0;
};

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Deep Links
  DeepLinks,
  
  // Sharing
  shareDAO,
  shareGuildInvite,
  shareGuild,
  shareProfile,
  shareProposal,
  createPaymentRequest,
  shareToken,
  shareNFT,
  
  // Formatting
  formatAddress,
  formatTimeAgo,
  formatNumber,
  formatTimeRemaining,
  
  // Clipboard
  copyToClipboard,
  
  // Explorer
  openExplorer,
  openTransaction,
  openContract,
  
  // Validation
  isValidAddress,
  isValidTxHash,
  isValidAmount,
  
  // Voting
  calculateVotePercentage,
};