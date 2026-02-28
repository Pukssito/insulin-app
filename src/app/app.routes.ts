import { Routes } from '@angular/router';
import { HistoryPage } from './history/history.page';

export const routes: Routes = [
  {
    path: 'setup',
    loadComponent: () => import('./setup/setup.page').then(m => m.SetupPage)
  },
  {
    path: 'home',
    loadComponent: () => import('./home/home.page').then(m => m.HomePage)
  },
  {
    path: 'history',
    component: HistoryPage
  },
  { path: '', redirectTo: 'home', pathMatch: 'full' }
];
