import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'setup',
    loadComponent: () => import('./setup/setup.page').then(m => m.SetupPage)
  },
  {
    path: 'home',
    loadComponent: () => import('./home/home.page').then(m => m.HomePage)
  },
  { path: '', redirectTo: 'home', pathMatch: 'full' } // <- 'full' en minúsculas
];
