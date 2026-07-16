// Test setup for vitest + Angular 17
// Equivalente a @analogjs/vitest-angular/test-setup (no exportado en 2.6.3).
// Inicializa zone.js, plugins de test, compiler y TestBed.
import 'zone.js';
import 'zone.js/plugins/sync-test';
import 'zone.js/plugins/proxy';
import 'zone.js/testing';
import '@analogjs/vite-plugin-angular/setup-vitest';
import '@angular/compiler';

import { getTestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';

getTestBed().initTestEnvironment(
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting()
);
