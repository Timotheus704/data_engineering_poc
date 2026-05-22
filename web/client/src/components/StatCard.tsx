import { tokens, presets } from '../styles/tokens';

interface Props {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}

export default function StatCard({ label, value, sub, color = tokens.color.accent.blue }: Props) {
  return (
    <div style={{
      ...presets.card,
      padding: `${tokens.spacing['2xl']}px`,
      minWidth: 160,
    }}>
      <div style={{
        fontSize: tokens.fontSize.xs,
        color: tokens.color.text.muted,
        marginBottom: tokens.spacing.sm,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 28,
        fontWeight: tokens.fontWeight.bold,
        color,
      }}>
        {value}
      </div>
      {sub && (
        <div style={{
          fontSize: tokens.fontSize.sm,
          color: tokens.color.text.disabled,
          marginTop: tokens.spacing.xs,
        }}>
          {sub}
        </div>
      )}
    </div>
  );
}
