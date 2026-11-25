'use client';

import {useState} from 'react';
import {Info, RotateCcw} from 'lucide-react';
import {Button} from '@astryxdesign/core/Button';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Link} from '@astryxdesign/core/Link';
import {Text} from '@astryxdesign/core/Text';
import styles from './home-section-tabs.module.css';

/** The top of the page: ⓘ (what this is) on the left, the Quiet Table
 * lockup in the middle (as on the iOS splash), and "Start over" on the right
 * once there are results. */
export function HomeHeader({
  restartVisible = false,
  onRestart,
}: {
  restartVisible?: boolean;
  onRestart?: () => void;
}) {
  const [aboutOpen, setAboutOpen] = useState(false);
  return (
    <>
      <HStack className={styles.header} vAlign="center">
        <HStack className={styles.side} hAlign="start">
          <Button
            label="What is Quiet Table?"
            variant="ghost"
            size="sm"
            isIconOnly
            icon={<Info size={18} strokeWidth={1.75} aria-hidden />}
            onClick={() => setAboutOpen(true)}
          />
        </HStack>
        {/* eslint-disable-next-line @next/next/no-img-element -- a small static PNG, the iOS splash lockup */}
        <img className={styles.lockup} src="/brand/quiet-table-lockup.png" alt="Quiet Table" width={780} height={160} />
        <HStack className={styles.side} hAlign="end">
          {onRestart != null && restartVisible ? (
            <Button
              label="Start over"
              variant="ghost"
              size="sm"
              icon={<RotateCcw size={14} strokeWidth={1.75} aria-hidden />}
              onClick={onRestart}
            />
          ) : null}
        </HStack>
      </HStack>
      <Dialog isOpen={aboutOpen} onOpenChange={setAboutOpen} width="min(480px, 92vw)">
        <DialogHeader title="What is Quiet Table?" onOpenChange={setAboutOpen} />
        <VStack gap={3} className={styles.about}>
          {/* Placeholder copy: Philip to rewrite. */}
          <Text>
            Quiet Table finds you a good table in Amsterdam or London. Say what kind of night it is, who&apos;s coming
            and when, and it picks from places chosen by hand, not a list of every restaurant in town.
          </Text>
          <Text>
            The scores come from people using the Quiet Table iPhone app, where friends share where they&apos;ve eaten
            and what they thought. The app is in testing for now.
          </Text>
          <Text>
            Quiet Table is an idea designed and built by{' '}
            <Link href="https://philipreadman.com" target="_blank" rel="noopener noreferrer" hasUnderline>
              Philip Readman
            </Link>
            , a product designer and builder based in Amsterdam.
          </Text>
          <Text>
            Want to support this project, or find it useful?{' '}
            <Link
              href="mailto:philip.readman@gmail.com?subject=Quiet%20Table%20iOS%20app"
              hasUnderline>
              Ask to join the iOS app
            </Link>
            .
          </Text>
          <Text color="secondary">
            Some answers use AI, paid for by a small daily budget everyone shares. When it runs out, picks come
            straight from our list until tomorrow.
          </Text>
        </VStack>
      </Dialog>
    </>
  );
}
