import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  Clipboard,
  Modal,
  ActivityIndicator,
  Animated,
  SafeAreaView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useWallet } from "../../contexts/WalletContext";
import { useTheme } from "../../contexts/ThemeContext";
import Button from "../../components/common/Button";
import Input from "../../components/common/Input";
import { isValidMnemonic } from "../../utils/Wallet";
import Alert from "../../utils/Alert";

const WalletSetupScreen = ({ navigation, route }) => {
  const { COLORS, isDark } = useTheme();
  const styles = createStyles(COLORS, isDark);
  const { createWallet, importWallet, loading, encryptionProgress } =
    useWallet();

  const [mode, setMode] = useState(null);
  const [walletName, setWalletName] = useState("Main Wallet");
  const [localPasscode, setLocalPasscode] = useState("");
  const [confirmPasscode, setConfirmPasscode] = useState("");
  const [mnemonic, setMnemonic] = useState("");
  const [generatedMnemonic, setGeneratedMnemonic] = useState("");
  const [errors, setErrors] = useState({});
  const [copied, setCopied] = useState(false);

  // Modal and animation state
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [currentStage, setCurrentStage] = useState("generating");

  // Animation refs
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const closeTimeoutRef = useRef(null);

  // Entry animation
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, [mode]);

  // Progress modal logic
  useEffect(() => {
    if (encryptionProgress) {
      if (!showProgressModal) {
        setShowProgressModal(true);
        setCurrentStage(encryptionProgress.stage);
        startProgressSimulation();
      } else {
        setCurrentStage(encryptionProgress.stage);
      }
    } else if (showProgressModal) {
      stopProgressSimulation();
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: false,
      }).start();

      closeTimeoutRef.current = setTimeout(() => {
        setShowProgressModal(false);
        progressAnim.setValue(0);
      }, 500);
    }

    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, [encryptionProgress, showProgressModal]);

  const startProgressSimulation = () => {
    progressAnim.setValue(0);
    Animated.timing(progressAnim, {
      toValue: 0.9,
      duration: 3000,
      useNativeDriver: false,
    }).start();
  };

  const stopProgressSimulation = () => {
    progressAnim.stopAnimation();
  };

  const getStageInfo = (stage) => {
    const stages = {
      generating: {
        title: "Creating Your Wallet",
        description: "Setting up your secure wallet...",
        icon: "sparkles",
      },
      importing: {
        title: "Restoring Wallet",
        description: "Getting your wallet ready...",
        icon: "download",
      },
      encrypting: {
        title: "Securing Wallet",
        description: "Protecting your data...",
        icon: "shield-checkmark",
      },
      deriving: {
        title: "Finalizing Security",
        description: "Almost there...",
        icon: "lock-closed",
      },
      finalizing: {
        title: "Almost Done",
        description: "Finishing up...",
        icon: "checkmark-circle",
      },
      saving: {
        title: "Saving Securely",
        description: "Storing your wallet...",
        icon: "save",
      },
      complete: {
        title: "Success!",
        description: "Your wallet is ready",
        icon: "checkmark-circle",
      },
    };
    return (
      stages[stage] || {
        title: "Processing",
        description: "Please wait...",
        icon: "hourglass",
      }
    );
  };

  const validateForm = () => {
    const newErrors = {};

    if (!walletName.trim()) {
      newErrors.walletName = "Wallet name is required";
    }

    if (!localPasscode) {
      newErrors.localPasscode = "PIN is required";
    } else if (localPasscode.length < 6) {
      newErrors.localPasscode = "PIN must be at least 6 digits";
    }

    if (localPasscode !== confirmPasscode) {
      newErrors.confirmPasscode = "PINs do not match";
    }

    if (mode === "import" && !isValidMnemonic(mnemonic)) {
      newErrors.mnemonic = "Invalid recovery phrase";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleCreateWallet = async () => {
    if (!validateForm()) return;

    try {
      const result = await createWallet(localPasscode, walletName);
      setGeneratedMnemonic(result.mnemonic);

      Alert.alert(
        "Important",
        "Please write down your recovery phrase and store it safely. You will need it to recover your wallet.",
        [{ text: "I Understand" }],
      );
    } catch (error) {
      console.error("Wallet creation error:", error);
      Alert.alert("Error", "Failed to create wallet. Please try again.");
    }
  };

  const handleImportWallet = async () => {
    if (!validateForm()) return;

    try {
      await importWallet(mnemonic.trim(), localPasscode, walletName);
      Alert.alert("Success", "Wallet imported successfully!");
      navigation.replace("Home");
    } catch (error) {
      console.error("Wallet import error:", error);
      Alert.alert(
        "Error",
        "Failed to import wallet. Please check your recovery phrase.",
      );
    }
  };

  const handleCopyMnemonic = () => {
    Clipboard.setString(generatedMnemonic);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Progress Modal Component
  const ProgressModal = () => {
    if (!showProgressModal) return null;

    const stageInfo = getStageInfo(currentStage);
    const animatedWidth = progressAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ["0%", "100%"],
    });

    return (
      <Modal
        transparent
        visible={true}
        animationType="fade"
        statusBarTranslucent
      >
        <BlurView
          intensity={isDark ? 80 : 60}
          tint={isDark ? "dark" : "light"}
          style={styles.modalBlur}
        >
          <View style={styles.modalOverlay}>
            <Animated.View style={[styles.progressCard, { opacity: fadeAnim }]}>
              {/* Animated Icon */}
              <View style={styles.progressIconWrapper}>
                <LinearGradient
                  colors={
                    isDark ? ["#A8D14F", "#8FBC3F"] : ["#8FBC3F", "#B5D96A"]
                  }
                  style={styles.progressIconGradient}
                >
                  <Ionicons name={stageInfo.icon} size={48} color="#FFFFFF" />
                </LinearGradient>
              </View>

              {/* Title & Description */}
              <Text style={styles.progressTitle}>{stageInfo.title}</Text>
              <Text style={styles.progressDescription}>
                {stageInfo.description}
              </Text>

              {/* Progress Bar */}
              <View style={styles.progressBarWrapper}>
                <View style={styles.progressBarTrack}>
                  <Animated.View
                    style={[styles.progressBarActive, { width: animatedWidth }]}
                  />
                </View>
              </View>

              {/* Spinner */}
              <ActivityIndicator
                size="small"
                color={COLORS.primary}
                style={{ marginTop: 12 }}
              />

              {/* Tip */}
              <View style={styles.progressTip}>
                <Ionicons
                  name="time-outline"
                  size={12}
                  color={COLORS.textSecondary}
                />
                <Text style={styles.progressTipText}>
                  This usually takes a few seconds
                </Text>
              </View>
            </Animated.View>
          </View>
        </BlurView>
      </Modal>
    );
  };

  // Success Screen - Mnemonic Display
  if (generatedMnemonic) {
    return (
      <SafeAreaView style={styles.container}>
        <Animated.View
          style={[
            styles.content,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Success Header */}
            <View style={styles.successHeader}>
              <View style={styles.successIconWrapper}>
                <LinearGradient
                  colors={
                    isDark ? ["#66BB6A", "#4CAF50"] : ["#4CAF50", "#66BB6A"]
                  }
                  style={styles.successIconGradient}
                >
                  <Ionicons name="checkmark-circle" size={56} color="#FFFFFF" />
                </LinearGradient>
              </View>
              <Text style={styles.successTitle}>Wallet Created!</Text>
              <Text style={styles.successSubtitle}>
                Save your recovery phrase securely
              </Text>
            </View>

            {/* Recovery Phrase Card */}
            <View style={styles.mnemonicCard}>
              {/* Header */}
              <View style={styles.mnemonicHeader}>
                <View style={styles.mnemonicHeaderIcon}>
                  <Ionicons name="key" size={20} color={COLORS.primary} />
                </View>
                <View>
                  <Text style={styles.mnemonicHeaderTitle}>
                    Recovery Phrase
                  </Text>
                  <Text style={styles.mnemonicHeaderSubtitle}>
                    Write this down in order
                  </Text>
                </View>
              </View>

              {/* Word Grid */}
              <View style={styles.mnemonicGrid}>
                {generatedMnemonic.split(" ").map((word, index) => (
                  <View key={index} style={styles.wordChip}>
                    <View style={styles.wordNumber}>
                      <Text style={styles.wordNumberText}>{index + 1}</Text>
                    </View>
                    <Text style={styles.wordText}>{word}</Text>
                  </View>
                ))}
              </View>

              {/* Copy Button */}
              <TouchableOpacity
                style={styles.copyButton}
                onPress={handleCopyMnemonic}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={
                    copied
                      ? isDark
                        ? ["#66BB6A", "#4CAF50"]
                        : ["#4CAF50", "#66BB6A"]
                      : isDark
                        ? [
                            "rgba(168, 209, 79, 0.15)",
                            "rgba(143, 188, 63, 0.08)",
                          ]
                        : [
                            "rgba(143, 188, 63, 0.2)",
                            "rgba(168, 209, 79, 0.12)",
                          ]
                  }
                  style={styles.copyButtonGradient}
                >
                  <Ionicons
                    name={copied ? "checkmark-circle" : "copy-outline"}
                    size={18}
                    color={copied ? "#FFFFFF" : COLORS.primary}
                  />
                  <Text
                    style={[
                      styles.copyButtonText,
                      copied && styles.copyButtonTextActive,
                    ]}
                  >
                    {copied ? "Copied!" : "Copy to Clipboard"}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* Warning Box */}
            <View style={styles.warningBox}>
              <Ionicons name="warning" size={20} color={COLORS.warning} />
              <View style={styles.warningTextContainer}>
                <Text style={styles.warningTitle}>Keep It Safe!</Text>
                <Text style={styles.warningText}>
                  Never share your recovery phrase. Anyone with it can access
                  your funds.
                </Text>
              </View>
            </View>

            {/* Continue Button */}
            <Button
              title="Continue to Wallet"
              onPress={() => navigation.replace("Home")}
              fullWidth
            />
          </ScrollView>
        </Animated.View>
      </SafeAreaView>
    );
  }

  // Mode Selection Screen
  if (!mode) {
    return (
      <SafeAreaView style={styles.container}>
        <Animated.View
          style={[
            styles.content,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Header */}
          <View style={styles.welcomeHeader}>
            <View style={styles.welcomeIconWrapper}>
              <LinearGradient
                colors={
                  isDark ? ["#A8D14F", "#8FBC3F"] : ["#8FBC3F", "#B5D96A"]
                }
                style={styles.welcomeIconGradient}
              >
                <Ionicons name="wallet" size={48} color="#FFFFFF" />
              </LinearGradient>
            </View>
            <Text style={styles.welcomeTitle}>Setup Your Wallet</Text>
            <Text style={styles.welcomeSubtitle}>
              Choose how you'd like to get started
            </Text>
          </View>

          {/* Option Cards */}
          <View style={styles.optionsContainer}>
            {/* Create Wallet */}
            <TouchableOpacity
              style={styles.optionCard}
              onPress={() => setMode("create")}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={
                  isDark
                    ? ["rgba(168, 209, 79, 0.15)", "rgba(143, 188, 63, 0.08)"]
                    : ["rgba(143, 188, 63, 0.2)", "rgba(168, 209, 79, 0.12)"]
                }
                style={styles.optionGradient}
              >
                <View style={styles.optionIconContainer}>
                  <Ionicons
                    name="add-circle"
                    size={40}
                    color={COLORS.primary}
                  />
                </View>
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>Create New Wallet</Text>
                  <Text style={styles.optionDescription}>
                    Generate a new wallet with a secure recovery phrase
                  </Text>
                </View>
                <Ionicons
                  name="arrow-forward"
                  size={24}
                  color={COLORS.primary}
                />
              </LinearGradient>
            </TouchableOpacity>

            {/* Import Wallet */}
            <TouchableOpacity
              style={styles.optionCard}
              onPress={() => setMode("import")}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={
                  isDark
                    ? ["rgba(168, 209, 79, 0.15)", "rgba(143, 188, 63, 0.08)"]
                    : ["rgba(143, 188, 63, 0.2)", "rgba(168, 209, 79, 0.12)"]
                }
                style={styles.optionGradient}
              >
                <View style={styles.optionIconContainer}>
                  <Ionicons name="download" size={40} color={COLORS.primary} />
                </View>
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>Import Existing</Text>
                  <Text style={styles.optionDescription}>
                    Restore your wallet using your recovery phrase
                  </Text>
                </View>
                <Ionicons
                  name="arrow-forward"
                  size={24}
                  color={COLORS.primary}
                />
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Security Badge */}
          <View style={styles.securityBadge}>
            <Ionicons
              name="shield-checkmark"
              size={16}
              color={COLORS.primary}
            />
            <Text style={styles.securityText}>
              Non-custodial • Your keys, your crypto
            </Text>
          </View>
        </Animated.View>
      </SafeAreaView>
    );
  }

  // Setup Form Screen
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Animated.View
          style={[
            { flex: 1 },
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Header with Back */}
            <View style={styles.setupHeader}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => setMode(null)}
                disabled={loading}
              >
                <Ionicons name="arrow-back" size={24} color={COLORS.text} />
              </TouchableOpacity>
              <View style={styles.setupHeaderContent}>
                <Text style={styles.setupTitle}>
                  {mode === "create" ? "Create Wallet" : "Import Wallet"}
                </Text>
                <Text style={styles.setupSubtitle}>
                  {mode === "create"
                    ? "Set up your new wallet securely"
                    : "Restore your existing wallet"}
                </Text>
              </View>
            </View>

            {/* Form */}
            <View style={styles.formContainer}>
              {/* Wallet Name Section */}
              <View style={styles.inputSection}>
                <View style={styles.inputSectionHeader}>
                  <Ionicons
                    name="wallet-outline"
                    size={18}
                    color={COLORS.textSecondary}
                  />
                  <Text style={styles.inputSectionTitle}>Wallet Name</Text>
                </View>
                <Input
                  value={walletName}
                  onChangeText={setWalletName}
                  placeholder="e.g., My Wallet"
                  error={errors.walletName}
                  editable={!loading}
                />
              </View>

              {/* Import Mnemonic */}
              {mode === "import" && (
                <View style={styles.inputSection}>
                  <View style={styles.inputSectionHeader}>
                    <Ionicons
                      name="key-outline"
                      size={18}
                      color={COLORS.textSecondary}
                    />
                    <Text style={styles.inputSectionTitle}>
                      Recovery Phrase
                    </Text>
                  </View>
                  <Input
                    value={mnemonic}
                    onChangeText={setMnemonic}
                    placeholder="Enter 12-word recovery phrase"
                    multiline
                    numberOfLines={4}
                    error={errors.mnemonic}
                    editable={!loading}
                  />
                  <Text style={styles.inputHelper}>
                    Separate each word with a space
                  </Text>
                </View>
              )}

              {/* Security PIN Section */}
              <View style={styles.inputSection}>
                <View style={styles.inputSectionHeader}>
                  <Ionicons
                    name="lock-closed-outline"
                    size={18}
                    color={COLORS.textSecondary}
                  />
                  <Text style={styles.inputSectionTitle}>Security PIN</Text>
                </View>
                <Text style={styles.inputSectionDesc}>
                  Create a 6-digit PIN to secure your wallet
                </Text>

                <Input
                  label="Create PIN"
                  value={localPasscode}
                  onChangeText={setLocalPasscode}
                  placeholder="Enter 6 digits"
                  keyboardType="number-pad"
                  secureTextEntry
                  maxLength={6}
                  error={errors.localPasscode}
                  editable={!loading}
                />

                <Input
                  label="Confirm PIN"
                  value={confirmPasscode}
                  onChangeText={setConfirmPasscode}
                  placeholder="Re-enter PIN"
                  keyboardType="number-pad"
                  secureTextEntry
                  maxLength={6}
                  error={errors.confirmPasscode}
                  editable={!loading}
                />
              </View>

              {/* Info Box */}
              <View style={styles.infoBox}>
                <Ionicons
                  name="information-circle"
                  size={20}
                  color={COLORS.primary}
                />
                <Text style={styles.infoText}>
                  Your PIN encrypts your wallet locally. Keep it safe!
                </Text>
              </View>

              {/* Action Buttons */}
              <View style={styles.buttonContainer}>
                <Button
                  title={mode === "create" ? "Create Wallet" : "Import Wallet"}
                  onPress={
                    mode === "create" ? handleCreateWallet : handleImportWallet
                  }
                  loading={loading}
                  disabled={loading}
                  fullWidth
                />

                <Button
                  title="Back"
                  onPress={() => setMode(null)}
                  variant="outline"
                  fullWidth
                  disabled={loading}
                />
              </View>
            </View>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>

      {/* Progress Modal */}
      <ProgressModal />
    </SafeAreaView>
  );
};

const createStyles = (COLORS, isDark) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
    },
    content: {
      flex: 1,
      padding: 20,
      justifyContent: "center",
    },
    scrollContent: {
      flexGrow: 1,
      padding: 20,
    },

    // Welcome/Mode Selection
    welcomeHeader: {
      alignItems: "center",
      marginBottom: 48,
    },
    welcomeIconWrapper: {
      marginBottom: 24,
    },
    welcomeIconGradient: {
      width: 96,
      height: 96,
      borderRadius: 48,
      justifyContent: "center",
      alignItems: "center",
      shadowColor: COLORS.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 8,
    },
    welcomeTitle: {
      fontSize: 32,
      fontWeight: "bold",
      color: COLORS.text,
      marginBottom: 8,
      letterSpacing: -0.5,
    },
    welcomeSubtitle: {
      fontSize: 15,
      color: COLORS.textSecondary,
      textAlign: "center",
    },
    optionsContainer: {
      gap: 16,
      marginBottom: 32,
    },
    optionCard: {
      borderRadius: 16,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: COLORS.border,
    },
    optionGradient: {
      flexDirection: "row",
      alignItems: "center",
      padding: 20,
      gap: 16,
    },
    optionIconContainer: {
      width: 64,
      height: 64,
      borderRadius: 16,
      backgroundColor: isDark
        ? "rgba(168, 209, 79, 0.2)"
        : "rgba(143, 188, 63, 0.2)",
      justifyContent: "center",
      alignItems: "center",
    },
    optionContent: {
      flex: 1,
    },
    optionTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: COLORS.text,
      marginBottom: 4,
    },
    optionDescription: {
      fontSize: 13,
      color: COLORS.textSecondary,
      lineHeight: 18,
    },
    securityBadge: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: isDark
        ? "rgba(168, 209, 79, 0.1)"
        : "rgba(143, 188, 63, 0.1)",
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 100,
      gap: 8,
      borderWidth: 1,
      borderColor: isDark
        ? "rgba(168, 209, 79, 0.2)"
        : "rgba(143, 188, 63, 0.2)",
    },
    securityText: {
      fontSize: 12,
      color: COLORS.textSecondary,
      fontWeight: "600",
    },

    // Setup Form
    setupHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 32,
    },
    backButton: {
      padding: 8,
      marginRight: 12,
    },
    setupHeaderContent: {
      flex: 1,
    },
    setupTitle: {
      fontSize: 24,
      fontWeight: "700",
      color: COLORS.text,
      marginBottom: 4,
    },
    setupSubtitle: {
      fontSize: 14,
      color: COLORS.textSecondary,
    },
    formContainer: {
      flex: 1,
    },
    inputSection: {
      marginBottom: 28,
    },
    inputSectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 12,
    },
    inputSectionTitle: {
      fontSize: 13,
      fontWeight: "700",
      color: COLORS.text,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    inputSectionDesc: {
      fontSize: 13,
      color: COLORS.textSecondary,
      marginBottom: 12,
      lineHeight: 18,
    },
    inputHelper: {
      fontSize: 12,
      color: COLORS.textSecondary,
      marginTop: 6,
    },
    infoBox: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: isDark
        ? "rgba(168, 209, 79, 0.1)"
        : "rgba(143, 188, 63, 0.1)",
      padding: 16,
      borderRadius: 12,
      gap: 12,
      marginBottom: 28,
      borderWidth: 1,
      borderColor: isDark
        ? "rgba(168, 209, 79, 0.2)"
        : "rgba(143, 188, 63, 0.2)",
    },
    infoText: {
      flex: 1,
      fontSize: 12,
      color: COLORS.textSecondary,
      lineHeight: 17,
    },
    buttonContainer: {
      gap: 12,
    },

    // Success Screen
    successHeader: {
      alignItems: "center",
      marginBottom: 32,
    },
    successIconWrapper: {
      marginBottom: 24,
    },
    successIconGradient: {
      width: 96,
      height: 96,
      borderRadius: 48,
      justifyContent: "center",
      alignItems: "center",
      shadowColor: "#4CAF50",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 8,
    },
    successTitle: {
      fontSize: 28,
      fontWeight: "bold",
      color: COLORS.text,
      marginBottom: 8,
    },
    successSubtitle: {
      fontSize: 14,
      color: COLORS.textSecondary,
      textAlign: "center",
    },
    mnemonicCard: {
      backgroundColor: COLORS.surface,
      borderRadius: 20,
      padding: 24,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: COLORS.border,
    },
    mnemonicHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 20,
      gap: 12,
    },
    mnemonicHeaderIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: isDark
        ? "rgba(168, 209, 79, 0.15)"
        : "rgba(143, 188, 63, 0.15)",
      justifyContent: "center",
      alignItems: "center",
    },
    mnemonicHeaderTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: COLORS.text,
    },
    mnemonicHeaderSubtitle: {
      fontSize: 12,
      color: COLORS.textSecondary,
    },
    mnemonicGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      marginBottom: 20,
    },
    wordChip: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: COLORS.background,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 10,
      minWidth: "30%",
      gap: 8,
      borderWidth: 1,
      borderColor: COLORS.border,
    },
    wordNumber: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: isDark
        ? "rgba(168, 209, 79, 0.2)"
        : "rgba(143, 188, 63, 0.2)",
      justifyContent: "center",
      alignItems: "center",
    },
    wordNumberText: {
      fontSize: 10,
      fontWeight: "700",
      color: COLORS.primary,
    },
    wordText: {
      fontSize: 13,
      fontWeight: "600",
      color: COLORS.text,
      flex: 1,
    },
    copyButton: {
      borderRadius: 12,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: COLORS.border,
    },
    copyButtonGradient: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 14,
      gap: 8,
    },
    copyButtonText: {
      fontSize: 14,
      fontWeight: "600",
      color: COLORS.primary,
    },
    copyButtonTextActive: {
      color: "#FFFFFF",
    },
    warningBox: {
      flexDirection: "row",
      alignItems: "flex-start",
      backgroundColor: isDark
        ? "rgba(255, 167, 38, 0.1)"
        : "rgba(255, 167, 38, 0.15)",
      padding: 16,
      borderRadius: 12,
      gap: 12,
      marginBottom: 28,
      borderWidth: 1,
      borderColor: isDark
        ? "rgba(255, 167, 38, 0.3)"
        : "rgba(255, 167, 38, 0.3)",
    },
    warningTextContainer: {
      flex: 1,
    },
    warningTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: COLORS.warning,
      marginBottom: 4,
    },
    warningText: {
      fontSize: 12,
      color: COLORS.warning,
      lineHeight: 17,
    },

    // Progress Modal
    modalBlur: {
      flex: 1,
    },
    modalOverlay: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    progressCard: {
      backgroundColor: COLORS.surface,
      borderRadius: 24,
      padding: 32,
      width: "100%",
      maxWidth: 340,
      alignItems: "center",
      borderWidth: 1,
      borderColor: COLORS.border,
      ...Platform.select({
        ios: {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.3,
          shadowRadius: 16,
        },
        android: {
          elevation: 12,
        },
      }),
    },
    progressIconWrapper: {
      marginBottom: 24,
    },
    progressIconGradient: {
      width: 88,
      height: 88,
      borderRadius: 44,
      justifyContent: "center",
      alignItems: "center",
    },
    progressTitle: {
      fontSize: 22,
      fontWeight: "700",
      color: COLORS.text,
      marginBottom: 8,
      textAlign: "center",
    },
    progressDescription: {
      fontSize: 14,
      color: COLORS.textSecondary,
      marginBottom: 24,
      textAlign: "center",
    },
    progressBarWrapper: {
      width: "100%",
      marginBottom: 8,
    },
    progressBarTrack: {
      width: "100%",
      height: 6,
      backgroundColor: COLORS.background,
      borderRadius: 3,
      overflow: "hidden",
    },
    progressBarActive: {
      height: "100%",
      backgroundColor: COLORS.primary,
      borderRadius: 3,
    },
    progressTip: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: COLORS.background,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      gap: 6,
      marginTop: 16,
    },
    progressTipText: {
      fontSize: 11,
      color: COLORS.textSecondary,
    },
  });

export default WalletSetupScreen;
