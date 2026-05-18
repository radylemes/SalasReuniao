import { Routes } from '@angular/router';
import { HomeComponent } from 'src/app/pages/home/home.component';
import { NotFoundComponent } from 'src/app/pages/not-found/not-found.component';
import { RoomTabletComponent } from 'src/app/pages/room-tablet/room-tablet.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'tablet/:localidade/:roomEmail', component: RoomTabletComponent },
  { path: '**', component: NotFoundComponent },
];
