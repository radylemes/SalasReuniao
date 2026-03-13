import { Routes } from '@angular/router';
import { HomeComponent } from 'src/app/pages/home/home.component';
import { NotFoundComponent } from 'src/app/pages/not-found/not-found.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: '**', component: NotFoundComponent },
];
