'use client';

import {useEffect, useRef, useState} from 'react';
import styles from './restaurant-panel.module.css';

// Apple Maps on the web (MapKit JS), like the iOS app's map. Needs a MapKit JS
// token (Apple Developer → Certificates, IDs & Profiles → Keys → MapKit JS,
// then a token limited to the site's domains) in NEXT_PUBLIC_MAPKIT_TOKEN.
// Without one, the panel shows the address and an Apple Maps link instead.

const TOKEN = process.env.NEXT_PUBLIC_MAPKIT_TOKEN;
const SCRIPT_URL = 'https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.core.js';

type MapKit = {
  init: (options: {authorizationCallback: (done: (token: string) => void) => void}) => void;
  Coordinate: new (lat: number, lng: number) => unknown;
  CoordinateSpan: new (lat: number, lng: number) => unknown;
  CoordinateRegion: new (center: unknown, span: unknown) => unknown;
  Map: new (
    element: HTMLElement,
    options: Record<string, unknown>,
  ) => {addAnnotation: (annotation: unknown) => void; destroy: () => void};
  MarkerAnnotation: new (coordinate: unknown, options: Record<string, unknown>) => unknown;
  ColorScheme: {Light: string; Dark: string};
};

declare global {
  interface Window {
    mapkit?: MapKit;
  }
}

let loading: Promise<MapKit | null> | null = null;

function loadMapKit(): Promise<MapKit | null> {
  if (TOKEN == null || TOKEN.length === 0 || typeof window === 'undefined') return Promise.resolve(null);
  loading ??= new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.crossOrigin = 'anonymous';
    script.dataset.libraries = 'map,annotations';
    script.onload = () => {
      const mapkit = window.mapkit;
      if (mapkit == null) return resolve(null);
      mapkit.init({authorizationCallback: (done) => done(TOKEN)});
      resolve(mapkit);
    };
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
  return loading;
}

export function AppleMap({lat, lng, name}: {lat: number; lng: number; name: string}) {
  const mount = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(TOKEN == null || TOKEN.length === 0);

  useEffect(() => {
    if (failed) return;
    let map: {destroy: () => void} | null = null;
    let cancelled = false;
    void loadMapKit().then((mapkit) => {
      if (cancelled || mount.current == null) return;
      if (mapkit == null) {
        setFailed(true);
        return;
      }
      const center = new mapkit.Coordinate(lat, lng);
      const created = new mapkit.Map(mount.current, {
        region: new mapkit.CoordinateRegion(center, new mapkit.CoordinateSpan(0.012, 0.012)),
        showsCompass: 'hidden',
        showsScale: 'hidden',
        showsMapTypeControl: false,
        isRotationEnabled: false,
        colorScheme: mapkit.ColorScheme.Dark,
      });
      created.addAnnotation(new mapkit.MarkerAnnotation(center, {title: name, color: '#3f4a3c'}));
      map = created;
    });
    return () => {
      cancelled = true;
      map?.destroy();
    };
  }, [failed, lat, lng, name]);

  if (failed) return null;
  return <div ref={mount} className={styles.map} role="img" aria-label={`Map of ${name}`} />;
}

export function hasMapKitToken(): boolean {
  return TOKEN != null && TOKEN.length > 0;
}
