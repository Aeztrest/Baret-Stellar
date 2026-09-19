import { Button } from '@/components/Button'
import { Heading } from '@/components/Heading'

const guides = [
  {
    href: '/quickstart',
    name: 'Quickstart',
    description:
      'Create a free key and analyze your first Stellar transaction in a few minutes.',
  },
  {
    href: '/authentication',
    name: 'Authentication',
    description:
      'How to get an API key, send it, and what the rate limits and x402 pay-per-call mode mean.',
  },
  {
    href: '/detectors',
    name: 'Risk Detectors',
    description:
      'Every finding code Baret can report, its severity, and the policy option that makes it blocking.',
  },
  {
    href: '/policies',
    name: 'Policy',
    description:
      'Turn findings into blocks: every option, how blocking works, and ready-made presets.',
  },
]

export function Guides() {
  return (
    <div className="my-16 xl:max-w-none">
      <Heading level={2} id="guides">
        Guides
      </Heading>
      <div className="not-prose mt-4 grid grid-cols-1 gap-8 border-t border-zinc-900/5 pt-10 sm:grid-cols-2 xl:grid-cols-4 dark:border-white/5">
        {guides.map((guide) => (
          <div key={guide.href}>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
              {guide.name}
            </h3>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {guide.description}
            </p>
            <p className="mt-4">
              <Button href={guide.href} variant="text" arrow="right">
                Read more
              </Button>
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
