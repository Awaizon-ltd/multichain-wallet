// SwapBridgeScreen.js
import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  StatusBar,
} from "react-native";
import { useTheme } from "../../contexts/ThemeContext";
import { SPACING, FONTS, SHADOWS, BORDER_RADIUS } from "../../constants/Theme";
import BridgeScreen from "./BridgeScreen";
import SwapScreen from "./SwapScreen";

const { width } = Dimensions.get("window");

const SwapBridgeScreen = () => {
  const { COLORS } = useTheme();
  const [activeTab, setActiveTab] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;

  const tabs = [
    { id: 0, label: "Swap", component: SwapScreen },
    { id: 1, label: "Bridge", component: BridgeScreen },
  ];

  const handleTabPress = (tabIndex) => {
    setActiveTab(tabIndex);

    // Animate indicator
    Animated.spring(translateX, {
      toValue: tabIndex * (width / 2),
      useNativeDriver: true,
      tension: 80,
      friction: 10,
    }).start();
  };

  const ActiveComponent = tabs[activeTab].component;

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
              style={styles.tab}
              onPress={() => handleTabPress(index)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.tabText,
                  {
                    color:
                      activeTab === index
                        ? COLORS.primary
                        : COLORS.textSecondary,
                    fontWeight: activeTab === index ? "600" : "500",
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
              transform: [{ translateX }],
            },
          ]}
        />
      </View>

      {/* Content Area */}
      <View style={styles.content}>
        <ActiveComponent />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabBar: {
    paddingTop: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: "transparent",
  },
  tabContainer: {
    flexDirection: "row",
    paddingHorizontal: SPACING.md,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: SPACING.md,
  },
  tabText: {
    letterSpacing: 0.3,
  },
  indicator: {
    height: 3,
    width: width / 2,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  content: {
    flex: 1,
  },
  // Placeholder styles (remove when using real components)
  placeholderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderText: {
    fontSize: 18,
    fontWeight: "500",
  },
});

export default SwapBridgeScreen;
