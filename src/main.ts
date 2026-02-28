import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { importProvidersFrom, LOCALE_ID } from '@angular/core';
import { routes } from './app/app.routes';
import { IonicModule } from '@ionic/angular';
import { AppComponent } from './app/app.component';

import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';

registerLocaleData(localeEs);

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    importProvidersFrom(IonicModule.forRoot({})),
    { provide: LOCALE_ID, useValue: 'es' }
  ]
}).catch(err => console.error(err));
