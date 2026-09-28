import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
} from "react-native";
import { useTheme } from "../../contexts/ThemeContext";
import { SPACING, FONTS, SHADOWS } from "../../constants/Theme";
import BridgeScreen from "./BridgeScreen";
import SwapScreen from "./SwapNewSCreen";

const { width } = Dimensions.get("window");

const SwapBridgeScreen = () => {
  const { COLORS } = useTheme();
  const [activeTab, setActiveTab] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;

  // Bridge is powered by LI.FI, which routes between any supported chain —
  // no need to gate the tab to a specific chain like the old Mantle-only bridge.
  const tabs = [
    { id: 0, label: "Swap", component: SwapScreen },
    { id: 1, label: "Bridge", component: BridgeScreen },
  ];

  const tabWidth = width / tabs.length;

  const handleTabPress = (tabIndex) => {
    setActiveTab(tabIndex);
    Animated.spring(translateX, {
      toValue: tabIndex * tabWidth,
      useNativeDriver: true,
      tension: 80,
      friction: 10,
    }).start();
  };

  // If Bridge tab was active and we switch to a chain that hides it, reset to Swap
  const safeActiveTab = activeTab >= tabs.length ? 0 : activeTab;
  const ActiveComponent = tabs[safeActiveTab].component;

  return (
    <View style={[styles.container, { backgroundColor: COLORS.background }]}>
      {/* Tab Bar */}
      <View
        style={[
          styles.tabBar,
          { backgroundColor: COLORS.background, ...SHADOWS.small },
        ]}
      >
        <View
          style={[styles.tabContainer, { backgroundColor: COLORS.background }]}
        >
          {tabs.map((tab, index) => (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tab, { width: tabWidth }]}
              onPress={() => handleTabPress(index)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.tabText,
                  {
                    color:
                      safeActiveTab === index
                        ? COLORS.primary
                        : COLORS.textSecondary,
                    fontWeight: safeActiveTab === index ? "600" : "500",
                    fontSize: FONTS.sizes.lg,
                  },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Animated Indicator */}
        <Animated.View
          style={[
            styles.indicator,
            {
              backgroundColor: COLORS.primary,
              width: tabWidth,
              transform: [{ translateX }],
            },
          ]}
        />
      </View>

      {/* Content */}
      <View style={styles.content}>
        <ActiveComponent />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabBar: {
    paddingTop: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: "transparent",
  },
  tabContainer: { flexDirection: "row", paddingHorizontal: SPACING.md },
  tab: { alignItems: "center", paddingVertical: SPACING.md },
  tabText: { letterSpacing: 0.3 },
  indicator: { height: 3, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  content: { flex: 1 },
});

export default SwapBridgeScreen;
