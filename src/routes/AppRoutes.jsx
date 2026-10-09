import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '../context/AuthContext'
import ProtectedRoute from '../components/layout/ProtectedLayout'

import Login from '../pages/Login'
import TrackOrder from '../pages/public/TrackOrder'

import ComptoirDashboard from '../pages/comptoir/ComptoirDashboard'
import NewRepairOrder from '../pages/comptoir/NewRepairOrder'
import SellAccessory from '../pages/comptoir/SellAccessory'

import TechnicienDashboard from '../pages/technicien/TechnicienDashboard'
import RepairDetails from '../pages/technicien/RepairDetails'

import LogRepairExpense from '../pages/shared/LogRepairExpense'
import GeneralExpenses from '../pages/shared/GeneralExpenses'

import AdminDashboard from '../pages/admin/AdminDashboard'
import UsersManagement from '../pages/admin/UsersManagement'
import AccessoriesManagement from '../pages/admin/AccessoriesManagement'
import ExpensesApproval from '../pages/admin/ExpensesApproval'
import Reports from '../pages/admin/Reports'
import DailyReport from '../pages/admin/DailyReport'

import Caisse from '../pages/caisse/Caisse'
import Debts from '../pages/shared/Debts'
import VoidRequests from '../pages/admin/VoidRequests'
import PriceGuide from '../pages/shared/PriceGuide'
import ScanRedirect from '../pages/shared/ScanRedirect'
import ProductScanRedirect from '../pages/shared/ProductScanRedirect'
import Clients from '../pages/shared/Clients'
import { NotificationProvider } from '../context/NotificationContext'

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/track/:access_token" element={<TrackOrder />} />

            {/* Shared by all three roles — registered ONCE.
                (Registering the same path inside each role wrapper makes React Router
                match the first wrapper only, and a role not in it is sent to /unauthorized.) */}
            <Route element={<ProtectedRoute allowedRoles={['admin', 'comptoir', 'technicien']} />}>
              <Route path="/price-guide" element={<PriceGuide />} />
              <Route path="/o/:orderNumber" element={<ScanRedirect />} />
              <Route path="/p/:productId" element={<ProductScanRedirect />} />
            </Route>

            {/* Comptoir + Admin */}
            <Route element={<ProtectedRoute allowedRoles={['admin', 'comptoir']} />}>
              <Route path="/comptoir" element={<ComptoirDashboard />} />
              <Route path="/comptoir/new-order" element={<NewRepairOrder />} />
              <Route path="/comptoir/sell" element={<SellAccessory />} />
              <Route path="/comptoir/expenses" element={<LogRepairExpense />} />
              <Route path="/comptoir/general-expenses" element={<GeneralExpenses />} />
              <Route path="/caisse" element={<Caisse />} />
              <Route path="/comptoir/debts" element={<Debts />} />
              <Route path="/comptoir/clients" element={<Clients />} />
            </Route>

            {/* Technicien + Admin */}
            <Route element={<ProtectedRoute allowedRoles={['admin', 'technicien']} />}>
              <Route path="/technicien" element={<TechnicienDashboard />} />
              <Route path="/technicien/order/:id" element={<RepairDetails />} />
              <Route path="/technicien/expenses" element={<LogRepairExpense />} />
              <Route path="/technicien/general-expenses" element={<GeneralExpenses />} />
            </Route>

            {/* Admin only */}
            <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/users" element={<UsersManagement />} />
              <Route path="/admin/accessories" element={<AccessoriesManagement />} />
              <Route path="/admin/expenses" element={<LogRepairExpense />} />
              <Route path="/admin/general-expenses" element={<GeneralExpenses />} />
              <Route path="/admin/expenses-approval" element={<ExpensesApproval />} />
              <Route path="/admin/void-requests" element={<VoidRequests />} />
              <Route path="/admin/debts" element={<Debts />} />
              <Route path="/admin/clients" element={<Clients />} />
              <Route path="/admin/reports" element={<Reports />} />
              <Route path="/admin/reports/daily" element={<DailyReport />} />
            </Route>

            <Route
              path="/unauthorized"
              element={<p style={{ padding: 40 }}>غير مصرح لك بالوصول لهذي الصفحة</p>}
            />
          </Routes>
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
