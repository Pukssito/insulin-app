import { Component } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { RouterOutlet } from '@angular/router';
import { Notifications } from '../service/notifications.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [IonicModule, RouterOutlet],
  templateUrl: './app.component.html'
})
export class AppComponent {
  // Inyectamos Notifications para que su `effect` quede vivo desde
  // el arranque de la app (si nadie lo inyecta, `providedIn: 'root'`
  // no instancia el servicio y el effect nunca corre).
  // No usamos el servicio directamente aquí; cualquier page que
  // necesite pedir permiso lo inyecta por su cuenta.
  constructor(_notifications: Notifications) {}
}
