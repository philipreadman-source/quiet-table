'use client';

import type {CSSProperties} from 'react';
import {Tab, TabList} from '@astryxdesign/core/TabList';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/Layout';

export type HomeMainSection = 'find' | 'friends' | 'profile';

const tabBarWrap: CSSProperties = {
  width: '100%',
  maxWidth: 800,
  flexShrink: 0,
  paddingBlock: 32,
};

const placeholderPanel: CSSProperties = {
  flex: 1,
  width: '100%',
  maxWidth: 800,
  minHeight: 0,
};

export function HomeSectionTabBar({
  value,
  onChange,
}: {
  value: HomeMainSection;
  onChange: (section: HomeMainSection) => void;
}) {
  return (
    <div style={tabBarWrap}>
      <TabList
        value={value}
        onChange={(next) => onChange(next as HomeMainSection)}
        layout="fill"
        hasDivider>
        <Tab value="find" label="Find" />
        <Tab value="friends" label="Friends" />
        <Tab value="profile" label="Profile" />
      </TabList>
    </div>
  );
}

export function HomeProfileTabPanel() {
  return (
    <VStack style={placeholderPanel} hAlign="center" vAlign="center">
      <Text type="supporting" color="secondary">
        Profile view — design incoming.
      </Text>
    </VStack>
  );
}
