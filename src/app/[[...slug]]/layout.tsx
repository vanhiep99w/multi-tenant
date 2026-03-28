import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.pageTree}
      nav={{ title: 'Multi-Tenant Architecture' }}
      sidebar={{
        tabs: false,
      }}
    >
      {children}
    </DocsLayout>
  );
}
