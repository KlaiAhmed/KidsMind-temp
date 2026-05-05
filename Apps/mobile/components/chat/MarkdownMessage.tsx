import Markdown from 'react-native-markdown-display';
import { StyleSheet } from 'react-native';
import { Colors, Typography, Spacing, Radii } from '../../constants/theme';

const markdownStyles = StyleSheet.create({
  body: { ...Typography.body, color: Colors.text },
  heading1: { ...Typography.title, color: Colors.text, marginBottom: Spacing.sm },
  heading2: { ...Typography.bodyMedium, color: Colors.text, fontWeight: '700', marginBottom: Spacing.xs },
  strong: { fontWeight: '700', color: Colors.text },
  em: { fontStyle: 'italic', color: Colors.text },
  bullet_list: { marginTop: Spacing.xs },
  ordered_list: { marginTop: Spacing.xs },
  list_item: { marginBottom: 2 },
  code_inline: {
    fontFamily: 'monospace',
    backgroundColor: Colors.surfaceContainerHigh,
    paddingHorizontal: 4,
    borderRadius: Radii.xs,
    color: Colors.accentPurple,
    fontSize: 14,
  },
  fence: {
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: Radii.sm,
    padding: Spacing.sm,
    marginVertical: Spacing.xs,
  },
  hr: { backgroundColor: Colors.outline, height: 1, marginVertical: Spacing.sm },
  paragraph: { marginBottom: Spacing.xs },
});

export function MarkdownMessage({ content }: { content: string }) {
  return <Markdown style={markdownStyles}>{content}</Markdown>;
}
