/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { LanguageProvider } from './lib/i18n';
import { AuthProvider } from './context/AuthContext';
import { StoreProvider } from './context/StoreContext';
import { ProductionProvider } from './context/ProductionContext';
import { NotificationProvider } from './context/NotificationContext';
import { DashboardLayout } from './components/layout/DashboardLayout';

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <StoreProvider>
          <ProductionProvider>
            <NotificationProvider>
              <DashboardLayout />
            </NotificationProvider>
          </ProductionProvider>
        </StoreProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}
