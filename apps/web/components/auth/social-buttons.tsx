'use client'

import { Button } from '@/components/ui/button'
import { Icons } from '@/components/icons'
import { cn } from '@/lib/utils'
import type { SocialProvider } from '@aft/auth/providers'

const PROVIDER_UI: Record<SocialProvider, { label: string; Icon: typeof Icons.google }> = {
  google: { label: 'Google', Icon: Icons.google },
  github: { label: 'Github', Icon: Icons.gitHub },
}

type SocialButtonsProps = {
  providers: SocialProvider[]
  disabled: boolean
  onSelect: (provider: SocialProvider) => void
}

// One button per configured provider (edge case A11): one fills the row, two share it.
export function SocialButtons({ providers, disabled, onSelect }: SocialButtonsProps) {
  const known = providers.filter((provider) => provider in PROVIDER_UI)
  if (known.length === 0) return null

  return (
    <div className={cn('grid gap-3', known.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
      {known.map((provider) => {
        const { label, Icon } = PROVIDER_UI[provider]
        return (
          <Button
            key={provider}
            type="button"
            variant="outline"
            className="w-full"
            disabled={disabled}
            onClick={() => onSelect(provider)}
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </Button>
        )
      })}
    </div>
  )
}
