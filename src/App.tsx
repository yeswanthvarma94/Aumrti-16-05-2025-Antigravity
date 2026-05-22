import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useNavigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppShell from "@/components/layout/AppShell";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/login/LoginPage";
import NotFound from "./pages/NotFound";
import AuthGuard from "@/components/auth/AuthGuard";
import RoleGuard from "@/components/auth/RoleGuard";
import ModuleErrorBoundary from "@/components/auth/ModuleErrorBoundary";
import { ROUTE_ROLES } from "@/lib/routeRoles";
import { HospitalProvider } from "@/contexts/HospitalContext";

const Register = lazy(() => import("./pages/register"));
const OnboardingWizard = lazy(() => import("./pages/setup/OnboardingWizard"));
const Dashboard = lazy(() => import("./pages/Dashboard"));

const QualityPage = lazy(() => import("./pages/quality/QualityPage"));
const BillingPage = lazy(() => import("./pages/billing/BillingPage"));
const DailyCashClosurePage = lazy(() => import("./pages/billing/DailyCashClosurePage"));
const PaymentsPage = lazy(() => import("./pages/billing/PaymentsPage"));
const PharmacyPage = lazy(() => import("./pages/pharmacy/PharmacyPage"));
const OPDPage = lazy(() => import("./pages/opd/OPDPage"));
const OTPage = lazy(() => import("./pages/ot/OTPage"));
const LabPage = lazy(() => import("./pages/lab/LabPage"));
const RadiologyPage = lazy(() => import("./pages/radiology/RadiologyPage"));
const IPDPage = lazy(() => import("./pages/ipd/IPDPage"));
const DayCarePage = lazy(() => import("./pages/ipd/DayCarePage"));
const EmergencyPage = lazy(() => import("./pages/emergency/EmergencyPage"));
const InsurancePage = lazy(() => import("./pages/insurance/InsurancePage"));
const PatientsPage = lazy(() => import("./pages/patients/PatientsPage"));
const NursingPage = lazy(() => import("./pages/nursing/NursingPage"));
const WardNursingBoard = lazy(() => import("./pages/tv/WardNursingBoard"));
const HRPage = lazy(() => import("./pages/hr/HRPage"));
const InventoryPage = lazy(() => import("./pages/inventory/InventoryPage"));
const SettingsPage = lazy(() => import("./pages/settings/SettingsPage"));
const SettingsBankAccountsPage = lazy(() => import("./pages/settings/SettingsBankAccountsPage"));
const SettingsStaffPage = lazy(() => import("./pages/settings/SettingsStaffPage"));
const SettingsDepartmentsPage = lazy(() => import("./pages/settings/SettingsDepartmentsPage"));
const SettingsWardsPage = lazy(() => import("./pages/settings/SettingsWardsPage"));
const SettingsServicesPage = lazy(() => import("./pages/settings/SettingsServicesPage"));
const SettingsDrugsPage = lazy(() => import("./pages/settings/SettingsDrugsPage"));
const SettingsProfilePage = lazy(() => import("./pages/settings/SettingsProfilePage"));
const SettingsRolesPage = lazy(() => import("./pages/settings/SettingsRolesPage"));
const SettingsBrandingPage = lazy(() => import("./pages/settings/SettingsBrandingPage"));
const SettingsWhatsAppPage = lazy(() => import("./pages/settings/SettingsWhatsAppPage"));
const SettingsLanguagePage = lazy(() => import("./pages/settings/SettingsLanguagePage"));
const SettingsPlanPage = lazy(() => import("./pages/settings/SettingsPlanPage"));
const SettingsShiftsPage = lazy(() => import("./pages/settings/SettingsShiftsPage"));
const SettingsModulesPage = lazy(() => import("./pages/settings/SettingsModulesPage"));
const SettingsDoctorSchedulesPage = lazy(() => import("./pages/settings/SettingsDoctorSchedulesPage"));
const SettingsLabTestsPage = lazy(() => import("./pages/settings/SettingsLabTestsPage"));
const SettingsConsentFormsPage = lazy(() => import("./pages/settings/SettingsConsentFormsPage"));
const SettingsOTChecklistPage = lazy(() => import("./pages/settings/SettingsOTChecklistPage"));
const SettingsProtocolsPage = lazy(() => import("./pages/settings/SettingsProtocolsPage"));
const SettingsThresholdsPage = lazy(() => import("./pages/settings/SettingsThresholdsPage"));
const SettingsDischargeWorkflowPage = lazy(() => import("./pages/settings/SettingsDischargeWorkflowPage"));
const SettingsApprovalsPage = lazy(() => import("./pages/settings/SettingsApprovalsPage"));
const SettingsOPDWorkflowPage = lazy(() => import("./pages/settings/SettingsOPDWorkflowPage"));
const SettingsNotificationsPage = lazy(() => import("./pages/settings/SettingsNotificationsPage"));
const SettingsReportSchedulesPage = lazy(() => import("./pages/settings/SettingsReportSchedulesPage"));
const SettingsRazorpayPage = lazy(() => import("./pages/settings/SettingsRazorpayPage"));
const SettingsGSTPage = lazy(() => import("./pages/settings/SettingsGSTPage"));
const SettingsABDMPage = lazy(() => import("./pages/settings/SettingsABDMPage"));
const SettingsBackupPage = lazy(() => import("./pages/settings/SettingsBackupPage"));
const SettingsAPIKeysPage = lazy(() => import("./pages/settings/SettingsAPIKeysPage"));
const APIConfigHubPage = lazy(() => import("./pages/settings/APIConfigHubPage"));
const SettingsICDCodesPage = lazy(() => import("./pages/settings/SettingsICDCodesPage"));
const SpecialtyTemplateBuilderPage = lazy(() => import("./pages/settings/SpecialtyTemplateBuilderPage"));
const AnalyticsPage = lazy(() => import("./pages/analytics/AnalyticsPage"));
const InboxPage = lazy(() => import("./pages/inbox/InboxPage"));
const TelemedicinePage = lazy(() => import("./pages/telemedicine/TelemedicinePage"));
const HODDashboardPage = lazy(() => import("./pages/hod/HODDashboardPage"));
const CEOBoardPage = lazy(() => import("./pages/hod/CEOBoardPage"));
const TVDisplayPage = lazy(() => import("./pages/tv/TVDisplayPage"));
const DesignSystem = lazy(() => import("./pages/DesignSystem"));
const PatientPortal = lazy(() => import("./pages/portal/PatientPortal"));
const GoLiveChecklistPage = lazy(() => import("./pages/admin/GoLiveChecklistPage"));
const DataMigrationPage = lazy(() => import("./pages/admin/DataMigrationPage"));
const AccountsPage = lazy(() => import("./pages/accounts/AccountsPage"));
const OpeningBalancesPage = lazy(() => import("./pages/accounts/OpeningBalancesPage"));
const ChartOfAccountsPage = lazy(() => import("./pages/accounts/ChartOfAccountsPage"));
const JournalWorkbenchPage = lazy(() => import("./pages/accounts/JournalWorkbenchPage"));
const BloodBankPage = lazy(() => import("./pages/blood-bank/BloodBankPage"));
const CSSDPage = lazy(() => import("./pages/cssd/CSSDPage"));
const DialysisPage = lazy(() => import("./pages/dialysis/DialysisPage"));
const OncologyPage = lazy(() => import("./pages/oncology/OncologyPage"));
const ModulesPage = lazy(() => import("./pages/modules/ModulesPage"));
const MRDPage = lazy(() => import("./pages/mrd/MRDPage"));
const PmjayPage = lazy(() => import("./pages/pmjay/PmjayPage"));
const BiomedicalPage = lazy(() => import("./pages/biomedical/BiomedicalPage"));
const AssetsPage = lazy(() => import("./pages/assets/AssetsPage"));
const HousekeepingPage = lazy(() => import("./pages/housekeeping/HousekeepingPage"));
const HMISPage = lazy(() => import("./pages/hmis/HMISPage"));
const DietPage = lazy(() => import("./pages/dietetics/DietPage"));
const PaymentLandingPage = lazy(() => import("./pages/pay/PaymentLandingPage"));
const LMSPage = lazy(() => import("./pages/lms/LMSPage"));
const CRMPage = lazy(() => import("./pages/crm/CRMPage"));
const PROPage = lazy(() => import("./pages/pro/PROPage"));
const PhysioPage = lazy(() => import("./pages/physio/PhysioPage"));
const MortuaryPage = lazy(() => import("./pages/mortuary/MortuaryPage"));
const VaccinationPage = lazy(() => import("./pages/vaccination/VaccinationPage"));
const DentalPage = lazy(() => import("./pages/dental/DentalPage"));
const AyushPage = lazy(() => import("./pages/ayush/AyushPage"));
const MentalHealthPage = lazy(() => import("./pages/mental-health/MentalHealthPage"));
const ChronicDiseasePage = lazy(() => import("./pages/chronic-disease/ChronicDiseasePage"));
const PatientSummaryPage = lazy(() => import("./pages/patients/PatientSummaryPage"));
const PackagesPage = lazy(() => import("./pages/packages/PackagesPage"));
const IVFPage = lazy(() => import("./pages/ivf/IVFPage"));
const SettingsRadiologyPage = lazy(() => import("./pages/settings/SettingsRadiologyPage"));
const SettingsDayCareProceduresPage = lazy(() => import("./pages/settings/SettingsDayCareProceduresPage"));
const SchedulingPage = lazy(() => import("./pages/schedule/SchedulingPage"));
const AmbulancePage = lazy(() => import("./pages/ambulance/AmbulancePage"));
const HomeCarePage = lazy(() => import("./pages/home-care/HomeCarePage"));
const ObstetricANCPage = lazy(() => import("./pages/specialty/ObstetricANCPage"));
const NeonatalPage = lazy(() => import("./pages/specialty/NeonatalPage"));
const AnaesthesiaPage = lazy(() => import("./pages/specialty/AnaesthesiaPage"));
const OphthalmologyPage = lazy(() => import("./pages/specialty/OphthalmologyPage"));
const PartographPage = lazy(() => import("./pages/specialty/PartographPage"));
const ProcurementRecommendationsPage = lazy(() => import("./pages/inventory/ProcurementRecommendationsPage"));
const PublicBookingPage = lazy(() => import("./pages/packages/PublicBookingPage"));
const SettingsHMISPage = lazy(() => import("./pages/settings/SettingsHMISPage"));
const PatientJoinPage = lazy(() => import("./pages/teleconsult/PatientJoinPage"));
const CostCentresPage = lazy(() => import("./pages/accounts/CostCentresPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0,
    },
  },
});

const SuspenseWrap = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<div />}>{children}</Suspense>
);

const RG = ({ path, children }: { path: string; children: React.ReactNode }) => {
  const roles = ROUTE_ROLES[path];
  if (!roles) return <>{children}</>;
  return <RoleGuard allowedRoles={roles}>{children}</RoleGuard>;
};

/** Wraps a lazy module in ErrorBoundary for crash isolation. Suspense/loading is handled by AppShell. */
const SM = ({ name, children }: { name: string; children: React.ReactNode }) => {
  const navigate = useNavigate();
  return (
    <ModuleErrorBoundary moduleName={name} onNavigate={() => navigate("/dashboard")}>
      {children}
    </ModuleErrorBoundary>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <HospitalProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/pay/:token" element={<SuspenseWrap><PaymentLandingPage /></SuspenseWrap>} />
          <Route path="/packages/book" element={<SuspenseWrap><PublicBookingPage /></SuspenseWrap>} />
          <Route path="/join/:sessionId" element={<SuspenseWrap><PatientJoinPage /></SuspenseWrap>} />
          <Route path="/portal/*" element={<SuspenseWrap><PatientPortal /></SuspenseWrap>} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<SuspenseWrap><Register /></SuspenseWrap>} />
          <Route path="/setup/onboarding" element={<AuthGuard><SuspenseWrap><OnboardingWizard /></SuspenseWrap></AuthGuard>} />
          <Route path="/tv-display" element={<SuspenseWrap><TVDisplayPage /></SuspenseWrap>} />
          <Route path="/ward-board" element={<SuspenseWrap><WardNursingBoard /></SuspenseWrap>} />
          <Route path="/hod-dashboard" element={<AuthGuard><SuspenseWrap><HODDashboardPage /></SuspenseWrap></AuthGuard>} />
          <Route path="/ceo-board" element={<AuthGuard><SuspenseWrap><CEOBoardPage /></SuspenseWrap></AuthGuard>} />

          {/* App shell routes */}
          <Route element={<AuthGuard><AppShell /></AuthGuard>}>
            <Route path="/dashboard" element={<RG path="/dashboard"><SM name="Dashboard"><Dashboard /></SM></RG>} />
            <Route path="/modules" element={<RG path="/modules"><SM name="Modules"><ModulesPage /></SM></RG>} />
            <Route path="/patients" element={<RG path="/patients"><SM name="Patients"><PatientsPage /></SM></RG>} />
            <Route path="/patients/:id/summary" element={<RG path="/patients"><SM name="Patient 360° View"><PatientSummaryPage /></SM></RG>} />
            <Route path="/opd" element={<RG path="/opd"><SM name="OPD"><OPDPage /></SM></RG>} />
            <Route path="/schedule" element={<RG path="/schedule"><SM name="Scheduling"><SchedulingPage /></SM></RG>} />
            <Route path="/ipd" element={<RG path="/ipd"><SM name="IPD"><IPDPage /></SM></RG>} />
            <Route path="/ipd/day-care" element={<RG path="/ipd/day-care"><SM name="Day Care Unit"><DayCarePage /></SM></RG>} />
            <Route path="/emergency" element={<RG path="/emergency"><SM name="Emergency"><EmergencyPage /></SM></RG>} />
            <Route path="/ambulance" element={<RG path="/ambulance"><SM name="Ambulance Service"><AmbulancePage /></SM></RG>} />
            <Route path="/home-care" element={<RG path="/home-care"><SM name="Home Care"><HomeCarePage /></SM></RG>} />
            <Route path="/ot" element={<RG path="/ot"><SM name="Operation Theatre"><OTPage /></SM></RG>} />
            <Route path="/nursing" element={<RG path="/nursing"><SM name="Nursing"><NursingPage /></SM></RG>} />
            <Route path="/lab" element={<RG path="/lab"><SM name="Laboratory"><LabPage /></SM></RG>} />
            <Route path="/radiology" element={<RG path="/radiology"><SM name="Radiology"><RadiologyPage /></SM></RG>} />
            <Route path="/pharmacy" element={<RG path="/pharmacy"><SM name="Pharmacy"><PharmacyPage /></SM></RG>} />
            <Route path="/billing" element={<RG path="/billing"><SM name="Billing"><BillingPage /></SM></RG>} />
            <Route path="/billing/closure" element={<RG path="/billing/closure"><SM name="Day Closure"><DailyCashClosurePage /></SM></RG>} />
            <Route path="/insurance" element={<RG path="/insurance"><SM name="Insurance"><InsurancePage /></SM></RG>} />
            <Route path="/payments" element={<RG path="/payments"><SM name="Payments"><PaymentsPage /></SM></RG>} />
            <Route path="/hr" element={<RG path="/hr"><SM name="HR & Payroll"><HRPage /></SM></RG>} />
            <Route path="/inventory" element={<RG path="/inventory"><SM name="Inventory"><InventoryPage /></SM></RG>} />
            <Route path="/quality" element={<RG path="/quality"><SM name="Quality"><QualityPage /></SM></RG>} />
            <Route path="/analytics" element={<RG path="/analytics"><SM name="Analytics"><AnalyticsPage /></SM></RG>} />
            <Route path="/telemedicine" element={<RG path="/telemedicine"><SM name="Telemedicine"><TelemedicinePage /></SM></RG>} />
            <Route path="/inbox" element={<RG path="/inbox"><SM name="Inbox"><InboxPage /></SM></RG>} />
            <Route path="/settings" element={<RG path="/settings"><SM name="Settings"><SettingsPage /></SM></RG>} />
            <Route path="/settings/bank-accounts" element={<RG path="/settings"><SM name="Bank Accounts"><SettingsBankAccountsPage /></SM></RG>} />
            <Route path="/settings/staff" element={<RG path="/settings"><SM name="Staff"><SettingsStaffPage /></SM></RG>} />
            <Route path="/settings/departments" element={<RG path="/settings"><SM name="Departments"><SettingsDepartmentsPage /></SM></RG>} />
            <Route path="/settings/wards" element={<RG path="/settings"><SM name="Wards"><SettingsWardsPage /></SM></RG>} />
            <Route path="/settings/services" element={<RG path="/settings"><SM name="Services"><SettingsServicesPage /></SM></RG>} />
            <Route path="/settings/drugs" element={<RG path="/settings"><SM name="Drugs"><SettingsDrugsPage /></SM></RG>} />
            <Route path="/settings/profile" element={<RG path="/settings"><SM name="Profile"><SettingsProfilePage /></SM></RG>} />
            <Route path="/settings/roles" element={<RG path="/settings"><SM name="Roles"><SettingsRolesPage /></SM></RG>} />
            <Route path="/settings/branding" element={<RG path="/settings"><SM name="Branding"><SettingsBrandingPage /></SM></RG>} />
            <Route path="/settings/whatsapp" element={<RG path="/settings"><SM name="WhatsApp"><SettingsWhatsAppPage /></SM></RG>} />
            <Route path="/settings/language" element={<RG path="/settings"><SM name="Language"><SettingsLanguagePage /></SM></RG>} />
            <Route path="/settings/plan" element={<RG path="/settings"><SM name="Plan"><SettingsPlanPage /></SM></RG>} />
            <Route path="/settings/shifts" element={<RG path="/settings"><SM name="Shifts"><SettingsShiftsPage /></SM></RG>} />
            <Route path="/settings/modules" element={<RG path="/settings"><SM name="Modules Config"><SettingsModulesPage /></SM></RG>} />
            <Route path="/settings/doctor-schedules" element={<RG path="/settings"><SM name="Doctor Schedules"><SettingsDoctorSchedulesPage /></SM></RG>} />
            <Route path="/settings/lab-tests" element={<RG path="/settings"><SM name="Lab Tests"><SettingsLabTestsPage /></SM></RG>} />
            <Route path="/settings/consent-forms" element={<RG path="/settings"><SM name="Consent Forms"><SettingsConsentFormsPage /></SM></RG>} />
            <Route path="/settings/ot-checklist" element={<RG path="/settings"><SM name="OT Checklist"><SettingsOTChecklistPage /></SM></RG>} />
            <Route path="/settings/protocols" element={<RG path="/settings"><SM name="Protocols"><SettingsProtocolsPage /></SM></RG>} />
            <Route path="/settings/clinical-thresholds" element={<RG path="/settings"><SM name="Clinical Thresholds"><SettingsThresholdsPage /></SM></RG>} />
            <Route path="/settings/discharge-workflow" element={<RG path="/settings"><SM name="Discharge Workflow"><SettingsDischargeWorkflowPage /></SM></RG>} />
            <Route path="/settings/approvals" element={<RG path="/settings"><SM name="Approvals"><SettingsApprovalsPage /></SM></RG>} />
            <Route path="/settings/opd-workflow" element={<RG path="/settings"><SM name="OPD Workflow"><SettingsOPDWorkflowPage /></SM></RG>} />
            <Route path="/settings/notifications" element={<RG path="/settings"><SM name="Notifications"><SettingsNotificationsPage /></SM></RG>} />
            <Route path="/settings/report-schedules" element={<RG path="/settings"><SM name="Report Schedules"><SettingsReportSchedulesPage /></SM></RG>} />
            <Route path="/settings/razorpay" element={<RG path="/settings"><SM name="Razorpay"><SettingsRazorpayPage /></SM></RG>} />
            <Route path="/settings/hmis-portal" element={<RG path="/settings"><SM name="HMIS Portal"><SettingsHMISPage /></SM></RG>} />
            <Route path="/settings/gst" element={<RG path="/settings"><SM name="GST"><SettingsGSTPage /></SM></RG>} />
            <Route path="/settings/abdm" element={<RG path="/settings"><SM name="ABDM"><SettingsABDMPage /></SM></RG>} />
            <Route path="/settings/backup" element={<RG path="/settings"><SM name="Backup & Export"><SettingsBackupPage /></SM></RG>} />
            <Route path="/settings/api-keys" element={<RG path="/settings"><SM name="API Keys"><SettingsAPIKeysPage /></SM></RG>} />
            <Route path="/settings/api-hub" element={<RG path="/settings"><SM name="API Hub"><APIConfigHubPage /></SM></RG>} />
            <Route path="/settings/icd-codes" element={<RG path="/settings"><SM name="ICD Codes"><SettingsICDCodesPage /></SM></RG>} />
            <Route path="/settings/radiology" element={<RG path="/settings"><SM name="Radiology Settings"><SettingsRadiologyPage /></SM></RG>} />
            <Route path="/settings/day-care-procedures" element={<RG path="/settings"><SM name="Day Care Procedures"><SettingsDayCareProceduresPage /></SM></RG>} />
            <Route path="/settings/templates" element={<RG path="/settings"><SM name="EMR Templates"><SpecialtyTemplateBuilderPage /></SM></RG>} />
            <Route path="/accounts" element={<RG path="/accounts"><SM name="Accounts"><AccountsPage /></SM></RG>} />
            <Route path="/accounts/setup" element={<RG path="/accounts"><SM name="Opening Balances"><OpeningBalancesPage /></SM></RG>} />
            <Route path="/accounts/chart-of-accounts" element={<RG path="/accounts"><SM name="Chart of Accounts"><ChartOfAccountsPage /></SM></RG>} />
            <Route path="/accounts/journal-workbench" element={<RG path="/accounts"><SM name="Journal Workbench"><JournalWorkbenchPage /></SM></RG>} />
            <Route path="/accounts/cost-centres" element={<RG path="/accounts"><SM name="Cost Centres"><CostCentresPage /></SM></RG>} />
            <Route path="/blood-bank" element={<RG path="/blood-bank"><SM name="Blood Bank"><BloodBankPage /></SM></RG>} />
            <Route path="/cssd" element={<RG path="/cssd"><SM name="CSSD"><CSSDPage /></SM></RG>} />
            <Route path="/dialysis" element={<RG path="/dialysis"><SM name="Dialysis"><DialysisPage /></SM></RG>} />
            <Route path="/oncology" element={<RG path="/oncology"><SM name="Oncology"><OncologyPage /></SM></RG>} />
            <Route path="/mrd" element={<RG path="/mrd"><SM name="Medical Records"><MRDPage /></SM></RG>} />
            <Route path="/pmjay" element={<RG path="/pmjay"><SM name="PMJAY"><PmjayPage /></SM></RG>} />
            <Route path="/biomedical" element={<RG path="/biomedical"><SM name="Biomedical"><BiomedicalPage /></SM></RG>} />
            <Route path="/assets" element={<RG path="/assets"><SM name="Assets"><AssetsPage /></SM></RG>} />
            <Route path="/housekeeping" element={<RG path="/housekeeping"><SM name="Housekeeping"><HousekeepingPage /></SM></RG>} />
            <Route path="/hmis" element={<RG path="/hmis"><SM name="HMIS"><HMISPage /></SM></RG>} />
            <Route path="/dietetics" element={<RG path="/dietetics"><SM name="Dietetics"><DietPage /></SM></RG>} />
            <Route path="/lms" element={<RG path="/lms"><SM name="LMS"><LMSPage /></SM></RG>} />
            <Route path="/crm" element={<RG path="/crm"><SM name="CRM"><CRMPage /></SM></RG>} />
            <Route path="/pro" element={<RG path="/pro"><SM name="PRO"><PROPage /></SM></RG>} />
            <Route path="/physio" element={<RG path="/physio"><SM name="Physiotherapy"><PhysioPage /></SM></RG>} />
            <Route path="/mortuary" element={<RG path="/mortuary"><SM name="Mortuary"><MortuaryPage /></SM></RG>} />
            <Route path="/vaccination" element={<RG path="/vaccination"><SM name="Vaccination"><VaccinationPage /></SM></RG>} />
            <Route path="/dental" element={<RG path="/dental"><SM name="Dental"><DentalPage /></SM></RG>} />
            <Route path="/mental-health" element={<RG path="/mental-health"><SM name="Mental Health"><MentalHealthPage /></SM></RG>} />
            <Route path="/chronic-disease" element={<RG path="/chronic-disease"><SM name="Chronic Disease Management"><ChronicDiseasePage /></SM></RG>} />
            <Route path="/ayush" element={<RG path="/ayush"><SM name="AYUSH"><AyushPage /></SM></RG>} />
            <Route path="/packages" element={<RG path="/packages"><SM name="Health Packages"><PackagesPage /></SM></RG>} />
            <Route path="/ivf" element={<RG path="/ivf"><SM name="IVF"><IVFPage /></SM></RG>} />
            <Route path="/specialty/anc" element={<RG path="/opd"><SM name="Obstetric ANC"><ObstetricANCPage /></SM></RG>} />
            <Route path="/specialty/neonatal" element={<RG path="/ipd"><SM name="Neonatal EMR"><NeonatalPage /></SM></RG>} />
            <Route path="/specialty/anaesthesia" element={<RG path="/ot"><SM name="Anaesthesia EMR"><AnaesthesiaPage /></SM></RG>} />
            <Route path="/specialty/ophthalmology" element={<RG path="/opd"><SM name="Ophthalmology EMR"><OphthalmologyPage /></SM></RG>} />
            <Route path="/specialty/partograph" element={<RG path="/ipd"><SM name="Partograph"><PartographPage /></SM></RG>} />
            <Route path="/inventory/procurement-recommendations" element={<RG path="/inventory"><SM name="Procurement Recommendations"><ProcurementRecommendationsPage /></SM></RG>} />
            <Route path="/admin/go-live" element={<RG path="/admin/go-live"><SM name="Go-Live Checklist"><GoLiveChecklistPage /></SM></RG>} />
            <Route path="/admin/data-migration" element={<RG path="/admin/data-migration"><SM name="Data Migration"><DataMigrationPage /></SM></RG>} />
            <Route path="/design-system" element={<RG path="/design-system"><SM name="Design System"><DesignSystem /></SM></RG>} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
    </HospitalProvider>
  </QueryClientProvider>
);

export default App;
