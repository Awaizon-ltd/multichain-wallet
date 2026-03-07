import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, FONTS } from '../../constants/Theme';

const ArticleRenderer = ({ content }) => {
  const parseContent = (text) => {
    const lines = text.trim().split('\n');
    const elements = [];
    let currentList = [];
    let listType = null;
    let inCodeBlock = false;
    let codeBlockContent = [];

    lines.forEach((line, index) => {
      // Skip empty lines at start
      if (!line.trim() && elements.length === 0) return;

      // Code block toggle
      if (line.trim().startsWith('```')) {
        if (inCodeBlock) {
          // End code block
          elements.push(
            <View key={`code-${index}`} style={styles.codeBlock}>
              <Text style={styles.codeBlockText}>
                {codeBlockContent.join('\n')}
              </Text>
            </View>
          );
          codeBlockContent = [];
          inCodeBlock = false;
        } else {
          // Start code block
          inCodeBlock = true;
        }
        return;
      }

      // Inside code block
      if (inCodeBlock) {
        codeBlockContent.push(line);
        return;
      }

      // Close any open list before processing non-list items
      if (currentList.length > 0 && !line.trim().match(/^[-•*]\s/) && !line.trim().match(/^\d+\.\s/)) {
        elements.push(
          <View key={`list-${index}`} style={styles.list}>
            {currentList}
          </View>
        );
        currentList = [];
        listType = null;
      }

      // Heading 1
      if (line.startsWith('# ')) {
        elements.push(
          <Text key={index} style={styles.h1}>
            {line.replace('# ', '')}
          </Text>
        );
      }
      // Heading 2
      else if (line.startsWith('## ')) {
        elements.push(
          <Text key={index} style={styles.h2}>
            {line.replace('## ', '')}
          </Text>
        );
      }
      // Heading 3
      else if (line.startsWith('### ')) {
        elements.push(
          <Text key={index} style={styles.h3}>
            {line.replace('### ', '')}
          </Text>
        );
      }
      // Unordered list
      else if (line.trim().match(/^[-•*]\s/)) {
        const content = line.trim().replace(/^[-•*]\s/, '');
        currentList.push(
          <View key={`list-item-${index}`} style={styles.listItem}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.listItemText}>{parseInlineStyles(content)}</Text>
          </View>
        );
        listType = 'unordered';
      }
      // Ordered list
      else if (line.trim().match(/^\d+\.\s/)) {
        const match = line.trim().match(/^(\d+)\.\s(.+)/);
        if (match) {
          const [, number, content] = match;
          currentList.push(
            <View key={`list-item-${index}`} style={styles.listItem}>
              <Text style={styles.bullet}>{number}.</Text>
              <Text style={styles.listItemText}>{parseInlineStyles(content)}</Text>
            </View>
          );
          listType = 'ordered';
        }
      }
      // Blockquote
      else if (line.trim().startsWith('>')) {
        const content = line.trim().replace(/^>\s?/, '');
        elements.push(
          <View key={index} style={styles.blockquote}>
            <Text style={styles.blockquoteText}>{parseInlineStyles(content)}</Text>
          </View>
        );
      }
      // Warning/Note boxes (⚠️, 💡, ✅, ❌)
      else if (line.trim().match(/^[⚠️💡✅❌]/)) {
        const icon = line.trim()[0];
        const content = line.trim().substring(1).trim();
        const boxStyle = getBoxStyle(icon);
        
        elements.push(
          <View key={index} style={[styles.infoBox, boxStyle.container]}>
            <Text style={styles.infoBoxIcon}>{icon}</Text>
            <Text style={[styles.infoBoxText, boxStyle.text]}>
              {parseInlineStyles(content)}
            </Text>
          </View>
        );
      }
      // Empty line
      else if (line.trim() === '') {
        if (elements.length > 0) {
          elements.push(<View key={`space-${index}`} style={styles.spacer} />);
        }
      }
      // Regular paragraph
      else {
        elements.push(
          <Text key={index} style={styles.paragraph}>
            {parseInlineStyles(line.trim())}
          </Text>
        );
      }
    });

    // Close any remaining list
    if (currentList.length > 0) {
      elements.push(
        <View key="list-final" style={styles.list}>
          {currentList}
        </View>
      );
    }

    return elements;
  };

  const getBoxStyle = (icon) => {
    switch (icon) {
      case '⚠️':
        return {
          container: { backgroundColor: COLORS.warning + '15', borderLeftColor: COLORS.warning },
          text: { color: COLORS.text },
        };
      case '💡':
        return {
          container: { backgroundColor: COLORS.primary + '15', borderLeftColor: COLORS.primary },
          text: { color: COLORS.text },
        };
      case '✅':
        return {
          container: { backgroundColor: COLORS.success + '15', borderLeftColor: COLORS.success },
          text: { color: COLORS.text },
        };
      case '❌':
        return {
          container: { backgroundColor: COLORS.error + '15', borderLeftColor: COLORS.error },
          text: { color: COLORS.text },
        };
      default:
        return {
          container: { backgroundColor: COLORS.surface, borderLeftColor: COLORS.border },
          text: { color: COLORS.text },
        };
    }
  };

  const parseInlineStyles = (text) => {
    const parts = [];
    let currentText = text;
    let key = 0;

    // Match **bold**, `code`, and regular text
    const regex = /(\*\*[^*]+\*\*)|(`[^`]+`)|([^*`]+)/g;
    let match;

    while ((match = regex.exec(currentText)) !== null) {
      if (match[1]) {
        // Bold text
        const boldText = match[1].replace(/\*\*/g, '');
        parts.push(
          <Text key={key++} style={styles.bold}>
            {boldText}
          </Text>
        );
      } else if (match[2]) {
        // Inline code
        const codeText = match[2].replace(/`/g, '');
        parts.push(
          <Text key={key++} style={styles.inlineCode}>
            {codeText}
          </Text>
        );
      } else if (match[3]) {
        // Regular text
        parts.push(
          <Text key={key++}>
            {match[3]}
          </Text>
        );
      }
    }

    return parts.length > 0 ? parts : text;
  };

  return (
    <View style={styles.container}>
      {parseContent(content)}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  h1: {
    fontSize: FONTS.sizes.xxl,
    fontWeight: 'bold',
    color: COLORS.text,
    marginTop: SPACING.xl,
    marginBottom: SPACING.md,
  },
  h2: {
    fontSize: FONTS.sizes.xl,
    fontWeight: 'bold',
    color: COLORS.text,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  h3: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  paragraph: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text,
    lineHeight: 24,
    marginBottom: SPACING.md,
  },
  list: {
    marginBottom: SPACING.md,
  },
  listItem: {
    flexDirection: 'row',
    marginBottom: SPACING.xs,
    paddingRight: SPACING.md,
  },
  bullet: {
    fontSize: FONTS.sizes.md,
    color: COLORS.primary,
    fontWeight: 'bold',
    marginRight: SPACING.sm,
    minWidth: 20,
  },
  listItemText: {
    flex: 1,
    fontSize: FONTS.sizes.md,
    color: COLORS.text,
    lineHeight: 22,
  },
  bold: {
    fontWeight: 'bold',
    color: COLORS.text,
  },
  inlineCode: {
    backgroundColor: COLORS.surface,
    color: COLORS.primary,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
    borderRadius: 4,
    fontFamily: 'monospace',
    fontSize: FONTS.sizes.sm,
  },
  codeBlock: {
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    borderRadius: 8,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  codeBlockText: {
    fontFamily: 'monospace',
    fontSize: FONTS.sizes.sm,
    color: COLORS.text,
    lineHeight: 20,
  },
  blockquote: {
    backgroundColor: COLORS.surface,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
    paddingLeft: SPACING.md,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.md,
    borderRadius: 4,
  },
  blockquoteText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    lineHeight: 22,
  },
  infoBox: {
    flexDirection: 'row',
    padding: SPACING.md,
    borderRadius: 8,
    marginBottom: SPACING.md,
    borderLeftWidth: 4,
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  infoBoxIcon: {
    fontSize: 20,
  },
  infoBoxText: {
    flex: 1,
    fontSize: FONTS.sizes.md,
    lineHeight: 22,
  },
  spacer: {
    height: SPACING.sm,
  },
});

export default ArticleRenderer;