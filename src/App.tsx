//src/app.tsx

import React, { useEffect, useState } from 'react';
import { Redirect, Route } from 'react-router-dom';
import {
  IonApp,
  IonIcon,
  IonLabel,
  IonRouterOutlet,
  IonTabBar,
  IonTabButton,
  IonTabs,
  setupIonicReact,
  IonSpinner,
} from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import Home from './pages/Home';
import Menu from './pages/Menu';
import Orders from './pages/Orders';
import Settings from './pages/Settings';
import { home, restaurant, receipt, settings } from 'ionicons/icons';
import { PushNotifications } from '@capacitor/push-notifications';
import { restoreSession, saveSession, clearSession } from './lib/session';
import { supabase } from './services/supabase';
import { App } from '@capacitor/app';
useEffect(() => {
  const sub = App.addListener('appStateChange', async ({ isActive }) => {
    if (isActive) { await supabase.auth.startAutoRefresh(); }
    else { await supabase.auth.stopAutoRefresh(); }
  });
  return () => { sub.remove(); };
}, []);

import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import '@ionic/react/css/padding.css';
import '@ionic/react/css/float-elements.css';
import '@ionic/react/css/text-alignment.css';
import '@ionic/react/css/text-transformation.css';
import '@ionic/react/css/flex-utils.css';
import '@ionic/react/css/display.css';
import './theme/variables.css';

setupIonicReact();

const App: React.FC = () => {
  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    const initializeApp = async () => {
      try {
        // 1. First restore any saved session from Preferences
        const restored = await restoreSession();
        console.log('[App] Session restoration:', restored ? 'success' : 'none');

        // 2. Set up auth state listener to save/clear sessions
        const { data: listener } = supabase.auth.onAuthStateChange(
          async (event, session) => {
            console.log('[App] Auth state changed:', event);
            if (session) {
              await saveSession();
              console.log('[App] Session saved to storage');
            } else if (event === 'SIGNED_OUT') {
              await clearSession();
              console.log('[App] Session cleared from storage');
            }
          }
        );

        // 3. Initialize push notifications
        await initPush();

        // 4. Mark app as ready
        if (mounted) setAppReady(true);

        // Cleanup function
        return () => {
          listener?.subscription?.unsubscribe();
        };
      } catch (error) {
        console.error('[App] Initialization failed:', error);
        if (mounted) setAppReady(true); // Still allow app to load
      }
    };

    const initPush = async () => {
      try {
        await PushNotifications.createChannel({
          id: 'orders',
          name: 'Order Alerts',
          importance: 5,
          sound: 'beep.wav',
          vibration: true,
        });

        PushNotifications.addListener('registration', (token) => {
          if (!mounted) return;
          console.log('[Push] FCM Token:', token.value);
        });

        PushNotifications.addListener('registrationError', (err) => {
          console.log('[Push] FCM registration error:', JSON.stringify(err));
        });

        PushNotifications.addListener('pushNotificationReceived', (notif) => {
          console.log('[Push] Push received (foreground):', notif);
          new Notification(notif.title, {
            body: notif.body,
            icon: notif.data?.icon || '/favicon.ico',
          });
        });

        PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
          console.log('[Push] Notification tap (background):', JSON.stringify(action.notification));
        });

        const perm = await PushNotifications.requestPermissions();
        if (perm.receive === 'granted') {
          await PushNotifications.register();
        } else {
          console.log('[Push] Permission not granted');
        }
      } catch (e) {
        console.log('[Push] Init failed:', String(e));
      }
    };

    initializeApp();

    return () => {
      mounted = false;
    };
  }, []);

  if (!appReady) {
    return (
      <IonApp>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          flexDirection: 'column'
        }}>
          <IonSpinner name="crescent" />
          <p style={{ marginTop: '16px' }}>Loading CafeQR...</p>
        </div>
      </IonApp>
    );
  }

  return (
    <IonApp>
      <IonReactRouter>
        <IonTabs>
          <IonRouterOutlet>
            <Route exact path="/home">
              <Home />
            </Route>
            <Route exact path="/menu">
              <Menu />
            </Route>
            <Route exact path="/orders">
              <Orders />
            </Route>
            <Route exact path="/settings">
              <Settings />
            </Route>
            <Route exact path="/">
              <Redirect to="/home" />
            </Route>
          </IonRouterOutlet>

          <IonTabBar slot="bottom">
            <IonTabButton tab="home" href="/home">
              <IonIcon icon={home} />
              <IonLabel>Home</IonLabel>
            </IonTabButton>
            <IonTabButton tab="menu" href="/menu">
              <IonIcon icon={restaurant} />
              <IonLabel>Menu</IonLabel>
            </IonTabButton>
            <IonTabButton tab="orders" href="/orders">
              <IonIcon icon={receipt} />
              <IonLabel>Orders</IonLabel>
            </IonTabButton>
            <IonTabButton tab="settings" href="/settings">
              <IonIcon icon={settings} />
              <IonLabel>Settings</IonLabel>
            </IonTabButton>
          </IonTabBar>
        </IonTabs>
      </IonReactRouter>
    </IonApp>
  );
};

export default App;
