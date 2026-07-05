import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        store: {
          wall: 'var(--wall)',
          win: 'var(--win)',
          sidebar: 'var(--sidebar)',
          content: 'var(--content)',
          chrome: 'var(--chrome)',
          panel: 'var(--panel)',
          'panel-2': 'var(--panel-2)',
          border: 'var(--border)',
          'border-strong': 'var(--border-strong)',
          text: 'var(--text)',
          'text-2': 'var(--text-2)',
          'text-3': 'var(--text-3)',
          accent: 'var(--accent)',
          'accent-soft': 'var(--accent-soft)',
          green: 'var(--green)',
          'green-soft': 'var(--green-soft)',
          amber: 'var(--amber)',
          'amber-soft': 'var(--amber-soft)',
          red: 'var(--red)',
          provider: 'var(--provider)',
          'provider-soft': 'var(--provider-soft)',
          purple: 'var(--purple)',
          'purple-soft': 'var(--purple-soft)',
        },
      },
    },
  },
  plugins: [],
}

export default config
