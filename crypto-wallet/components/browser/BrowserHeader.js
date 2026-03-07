import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Pressable,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../../contexts/ThemeContext";

const BrowserHeader = ({
  inputUrl,
  setInputUrl,
  canGoBack,
  canGoForward,
  isLoading,
  webViewRef,
  handleGoHome,
  handleUrlSubmit,
  activeChain,
  isConnected,
  onChainPress,
  onDisconnect,
  onRefresh,
  onClose,
  onClearCache,
  onClearHistory,
}) => {
  const { COLORS, SPACING, FONTS, BORDER_RADIUS } = useTheme();
  const [showMenu, setShowMenu] = useState(false);

  const styles = createStyles(COLORS, SPACING, FONTS, BORDER_RADIUS);

  const menuItems = [
    {
      icon: "refresh",
      label: "Refresh Page",
      onPress: () => {
        webViewRef.current?.reload();
        onRefresh?.();
        setShowMenu(false);
      },
    },
    {
      icon: "stop-circle-outline",
      label: "Stop Loading",
      onPress: () => {
        webViewRef.current?.stopLoading();
        setShowMenu(false);
      },
      show: isLoading,
    },
    {
      icon: "share-outline",
      label: "Share URL",
      onPress: () => {
        // TODO: Implement share functionality
        console.log("Share:", inputUrl);
        setShowMenu(false);
      },
    },
    {
      icon: "copy-outline",
      label: "Copy URL",
      onPress: () => {
        // TODO: Implement copy to clipboard
        console.log("Copy:", inputUrl);
        setShowMenu(false);
      },
    },
    {
      icon: "trash-outline",
      label: "Clear Cache",
      onPress: () => {
        onClearCache?.();
        setShowMenu(false);
      },
    },
    {
      icon: "time-outline",
      label: "Clear History",
      onPress: () => {
        onClearHistory?.();
        setShowMenu(false);
      },
    },
    {
      icon: "link-off",
      label: "Clear dApp Connection",
      onPress: () => {
        webViewRef.current?.clearDappConnection?.();
        onDisconnect?.();
        setShowMenu(false);
      },
      show: isConnected,
      danger: true,
    },
    {
      icon: "close-circle",
      label: "Close Browser",
      onPress: () => {
        onClose?.();
        setShowMenu(false);
      },
      danger: true,
    },
  ];

  return (
    <View style={styles.container}>
      {/* Navigation Controls */}
      <View style={styles.navControls}>
        <TouchableOpacity
          style={[styles.navButton, !canGoBack && styles.navButtonDisabled]}
          onPress={() => webViewRef.current?.goBack()}
          disabled={!canGoBack}
        >
          <Ionicons name="chevron-back" size={20} color={COLORS.text} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navButton, !canGoForward && styles.navButtonDisabled]}
          onPress={() => webViewRef.current?.goForward()}
          disabled={!canGoForward}
        >
          <Ionicons name="chevron-forward" size={20} color={COLORS.text} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.navButton} onPress={handleGoHome}>
          <Ionicons name="home" size={18} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      {/* URL Input */}
      <View style={styles.urlInputContainer}>
        {!isLoading ? (
          <Ionicons
            name={isConnected ? "shield-checkmark" : "lock-closed"}
            size={14}
            color={isConnected ? COLORS.success : COLORS.textTertiary}
            style={styles.lockIcon}
          />
        ) : (
          <ActivityIndicator
            size="small"
            color={COLORS.primary}
            style={styles.lockIcon}
          />
        )}
        <TextInput
          style={styles.urlInput}
          value={inputUrl}
          onChangeText={setInputUrl}
          onSubmitEditing={handleUrlSubmit}
          placeholder="Enter URL or search..."
          placeholderTextColor={COLORS.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="go"
        />
        {isConnected && (
          <TouchableOpacity onPress={onDisconnect} style={styles.disconnectBtn}>
            <MaterialCommunityIcons
              name="link-off"
              size={16}
              color={COLORS.warning}
            />
          </TouchableOpacity>
        )}
      </View>

      {/* Chain Selector */}
      <TouchableOpacity onPress={onChainPress} style={styles.chainButton}>
        <View
          style={[
            styles.chainDot,
            { backgroundColor: isConnected ? COLORS.success : COLORS.warning },
          ]}
        />
        <Text style={styles.chainText} numberOfLines={1}>
          {activeChain.symbol}
        </Text>
      </TouchableOpacity>

      {/* Menu Button */}
      <TouchableOpacity
        style={styles.menuButton}
        onPress={() => setShowMenu(true)}
      >
        <Ionicons name="ellipsis-vertical" size={20} color={COLORS.text} />
      </TouchableOpacity>

      {/* Menu Modal */}
      <Modal
        visible={showMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMenu(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowMenu(false)}
        >
          <View style={styles.menuContainer}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>Browser Options</Text>
              <TouchableOpacity
                onPress={() => setShowMenu(false)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.menuItems}>
              {menuItems
                .filter((item) => item.show !== false)
                .map((item, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.menuItem}
                    onPress={item.onPress}
                  >
                    <Ionicons
                      name={item.icon}
                      size={22}
                      color={item.danger ? COLORS.error : COLORS.text}
                    />
                    <Text
                      style={[
                        styles.menuItemText,
                        item.danger && styles.menuItemTextDanger,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
};

const createStyles = (COLORS, SPACING, FONTS, BORDER_RADIUS) =>
  StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: COLORS.background,
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs,
      gap: SPACING.xs,
      paddingTop: 15,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border,
    },
    navControls: {
      flexDirection: "row",
      gap: SPACING.xs,
    },
    navButton: {
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: COLORS.card,
      borderRadius: BORDER_RADIUS.md,
    },
    navButtonDisabled: {
      opacity: 0.3,
    },
    urlInputContainer: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: COLORS.card,
      borderRadius: BORDER_RADIUS.md,
      paddingHorizontal: SPACING.md,
      height: 36,
    },
    lockIcon: {
      marginRight: SPACING.xs,
    },
    urlInput: {
      flex: 1,
      fontSize: FONTS.sizes.sm,
      color: COLORS.text,
      padding: 0,
    },
    disconnectBtn: {
      padding: SPACING.xs,
      marginLeft: SPACING.xs,
    },
    chainButton: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: COLORS.card,
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs,
      borderRadius: BORDER_RADIUS.md,
      gap: 4,
      minWidth: 60,
    },
    chainDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    chainText: {
      fontSize: FONTS.sizes.xs,
      fontWeight: "600",
      color: COLORS.text,
    },
    menuButton: {
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: COLORS.card,
      borderRadius: BORDER_RADIUS.md,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      justifyContent: "flex-end",
    },
    menuContainer: {
      backgroundColor: COLORS.card,
      borderTopLeftRadius: BORDER_RADIUS.xl,
      borderTopRightRadius: BORDER_RADIUS.xl,
      paddingBottom: SPACING.xl,
      maxHeight: "80%",
    },
    menuHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border,
    },
    menuTitle: {
      fontSize: FONTS.sizes.lg,
      fontWeight: "600",
      color: COLORS.text,
    },
    closeButton: {
      padding: SPACING.xs,
    },
    menuItems: {
      paddingTop: SPACING.sm,
    },
    menuItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
      gap: SPACING.md,
    },
    menuItemText: {
      fontSize: FONTS.sizes.md,
      color: COLORS.text,
      flex: 1,
    },
    menuItemTextDanger: {
      color: COLORS.error,
    },
  });

export default BrowserHeader;
