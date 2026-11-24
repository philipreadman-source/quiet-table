'use client';

import {RotateCcw} from 'lucide-react';
import {Button} from '@astryxdesign/core/Button';
import {HStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import styles from './home-section-tabs.module.css';

/** The top of the page: the name, and "Start over" once there are results. */
export function HomeHeader({
  restartVisible = false,
  onRestart,
}: {
  restartVisible?: boolean;
  onRestart?: () => void;
}) {
  return (
    <HStack className={styles.header} hAlign="between" vAlign="center">
      <Text weight="semibold">Quiet Table</Text>
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
  );
}
