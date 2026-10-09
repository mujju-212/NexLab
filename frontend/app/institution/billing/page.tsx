'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import InstitutionShell from '@/components/layout/InstitutionShell';
import { useAuthStore } from '@/store/auth-store';
import {
  institutionService,
  type BillingPlanInfo,
  type PlanUsageBreakdown,
  type BillingContactInfo,
  type PaymentMethodItem,
  type InvoiceItem,
  type PlanCatalogItem,
  type BillingOverviewResponse,
} from '@/services/institution.service';
import {
  Crown,
  CreditCard,
  Download,
  Edit,
  Plus,
  RefreshCw,
  Check,
  CheckCircle2,
  ChevronRight,
  GraduationCap,
  Building2,
  Mail,
  User,
  Phone,
  MapPin,
  X,
  FileText,
  HelpCircle,
  BarChart3,
  Loader2,
  Sparkles,
  BookOpen,
  Send,
  Users,
} from 'lucide-react';
import styles from './billing.module.css';

type SubTab = 'overview' | 'plans' | 'invoices' | 'payment_methods' | 'usage' | 'settings';

export default function BillingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  // Loading and action states
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<SubTab>('overview');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Data from backend
  const [plan, setPlan] = useState<BillingPlanInfo>({
    id: 'pro',
    name: 'NexLab Pro',
    description: 'For growing institutions that need more capacity and priority support.',
    status: 'active',
    price: 4999,
    currency: '₹',
    billing_cycle: 'monthly',
    next_billing_date: '10 Oct 2026',
    auto_renewal: true,
  });

  const [usage, setUsage] = useState<PlanUsageBreakdown>({
    resets_on: '10 Oct 2026',
    students: { used: 248, limit: 500, percent: 50 },
    instructors: { used: 6, limit: 50, percent: 12 },
    subjects: { used: 15, limit: 100, percent: 15 },
  });

  const [billingInfo, setBillingInfo] = useState<BillingContactInfo>({
    institution_name: 'Greenwood Institute',
    billing_email: 'billing@greenwood.edu',
    contact_person: 'Institution Admin',
    phone: '+91 98765 43210',
    address: '123 Education Street, HSR Layout, Bengaluru, Karnataka 560102, India',
  });

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodItem[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<InvoiceItem[]>([]);
  const [plansCatalog, setPlansCatalog] = useState<PlanCatalogItem[]>([]);

  // Modals state
  const [showEditInfoModal, setShowEditInfoModal] = useState(false);
  const [editInfoForm, setEditInfoForm] = useState<BillingContactInfo>({ ...billingInfo });
  const [savingInfo, setSavingInfo] = useState(false);

  const [showAddCardModal, setShowAddCardModal] = useState(false);
  const [cardForm, setCardForm] = useState({
    cardholder_name: 'Institution Admin',
    card_number: '',
    exp_month: '04',
    exp_year: '2028',
    card_brand: 'VISA',
  });
  const [savingCard, setSavingCard] = useState(false);

  const [showContactModal, setShowContactModal] = useState(false);
  const [contactMsg, setContactMsg] = useState('');
  const [sendingContact, setSendingContact] = useState(false);

  const [showUsageModal, setShowUsageModal] = useState(false);
  const [updatingPlan, setUpdatingPlan] = useState(false);
  const [togglingAutoRenewal, setTogglingAutoRenewal] = useState(false);
  const [downloadingInvId, setDownloadingInvId] = useState<string | null>(null);

  // Section references for scrolling on tab click
  const plansSectionRef = useRef<HTMLDivElement>(null);
  const invoicesSectionRef = useRef<HTMLDivElement>(null);
  const paymentMethodsSectionRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Load billing data from backend — through the react-query cache. The
  // mutation handlers below call loadBillingData(true) after a write, which
  // drops the cached copy first; simple revisits render from cache instantly.
  const loadBillingData = async (forceFresh = false) => {
    try {
      setLoading(true);
      if (forceFresh) {
        queryClient.removeQueries({ queryKey: ['institution', 'billing-overview'] });
      }
      const data: BillingOverviewResponse = await queryClient.fetchQuery({
        queryKey: ['institution', 'billing-overview'],
        queryFn: () => institutionService.getBillingOverview(),
        staleTime: 60 * 1000,
      });
      if (data.plan) {
        setPlan(data.plan);
        if (data.plan.billing_cycle) setBillingCycle(data.plan.billing_cycle);
      }
      if (data.usage) setUsage(data.usage);
      if (data.billing_info) {
        setBillingInfo(data.billing_info);
        setEditInfoForm(data.billing_info);
      }
      if (data.payment_methods) setPaymentMethods(data.payment_methods);
      if (data.recent_invoices) setRecentInvoices(data.recent_invoices);
      if (data.plans_catalog) setPlansCatalog(data.plans_catalog);
    } catch (err: any) {
      console.error('Failed to load billing overview:', err);
      showToast('Could not load billing information. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBillingData();
  }, []);

  // Handle sub-tab click and smooth scroll
  const handleTabClick = (tabKey: SubTab) => {
    setActiveTab(tabKey);
    if (tabKey === 'plans' && plansSectionRef.current) {
      plansSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (tabKey === 'invoices' && invoicesSectionRef.current) {
      invoicesSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (tabKey === 'payment_methods' && paymentMethodsSectionRef.current) {
      paymentMethodsSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (tabKey === 'usage') {
      setShowUsageModal(true);
    } else if (tabKey === 'settings') {
      setShowEditInfoModal(true);
    }
  };

  // Switch Plan Tier
  const handleSelectPlan = async (targetPlanKey: string) => {
    if (targetPlanKey === plan.id) return;
    if (targetPlanKey === 'enterprise') {
      setShowContactModal(true);
      return;
    }
    try {
      setUpdatingPlan(true);
      const res = await institutionService.updateBillingPlan({
        plan: targetPlanKey,
        billing_cycle: billingCycle,
      });
      showToast(res.message || `Switched to ${targetPlanKey.toUpperCase()}!`);
      await loadBillingData(true);
    } catch (err: any) {
      console.error('Plan switch failed:', err);
      showToast(err?.response?.data?.error || 'Failed to update plan.');
    } finally {
      setUpdatingPlan(false);
    }
  };

  // Toggle Auto-Renewal
  const handleToggleAutoRenewal = async () => {
    try {
      setTogglingAutoRenewal(true);
      const newStatus = !plan.auto_renewal;
      const res = await institutionService.toggleAutoRenewal(newStatus);
      setPlan((p) => ({ ...p, auto_renewal: res.auto_renewal }));
      showToast(res.message);
    } catch (err: any) {
      console.error('Toggle auto-renewal failed:', err);
      showToast('Failed to toggle auto-renewal.');
    } finally {
      setTogglingAutoRenewal(false);
    }
  };

  // Save Edited Billing Information
  const handleSaveBillingInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingInfo(true);
      const res = await institutionService.updateBillingInfo(editInfoForm);
      setBillingInfo(res.billing_info);
      setShowEditInfoModal(false);
      showToast('Billing information saved successfully!');
    } catch (err: any) {
      console.error('Save billing info failed:', err);
      showToast(err?.response?.data?.error || 'Failed to update billing info.');
    } finally {
      setSavingInfo(false);
    }
  };

  // Add New Payment Method
  const handleAddCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardForm.card_number.trim()) {
      showToast('Please enter a card number.');
      return;
    }
    try {
      setSavingCard(true);
      const res = await institutionService.addPaymentMethod({
        cardholder_name: cardForm.cardholder_name,
        card_number: cardForm.card_number,
        exp_month: parseInt(cardForm.exp_month, 10),
        exp_year: parseInt(cardForm.exp_year, 10),
        card_brand: cardForm.card_brand,
        is_default: true,
      });
      showToast(res.message);
      setShowAddCardModal(false);
      setCardForm({
        cardholder_name: 'Institution Admin',
        card_number: '',
        exp_month: '04',
        exp_year: '2028',
        card_brand: 'VISA',
      });
      await loadBillingData(true);
    } catch (err: any) {
      console.error('Add card failed:', err);
      showToast(err?.response?.data?.error || 'Failed to add card.');
    } finally {
      setSavingCard(false);
    }
  };

  // Download Invoice
  const handleDownloadInvoice = async (inv: InvoiceItem) => {
    try {
      setDownloadingInvId(inv.id);
      await institutionService.downloadInvoice(inv.id, inv.invoice_number);
      showToast(`Downloaded invoice receipt ${inv.invoice_number}`);
    } catch (err: any) {
      console.error('Download invoice failed:', err);
      showToast('Could not download invoice file.');
    } finally {
      setDownloadingInvId(null);
    }
  };

  // Contact Sales Submit
  const handleSendContact = (e: React.FormEvent) => {
    e.preventDefault();
    setSendingContact(true);
    setTimeout(() => {
      setSendingContact(false);
      setShowContactModal(false);
      setContactMsg('');
      showToast('Sales team notified! An executive will contact you shortly.');
    }, 700);
  };

  return (
    <InstitutionShell activePage="Billing & Plan">
      <div className={styles.pageContainer}>
        {/* ── Breadcrumbs ───────────────────────────────────────────────────────── */}
        <div className={styles.breadcrumbRow}>
          <span
            className={styles.breadcrumbLink}
            onClick={() => router.push('/institution/dashboard')}
          >
            Institution
          </span>
          <span className={styles.breadcrumbSeparator}>&gt;</span>
          <span
            className={styles.breadcrumbLink}
            onClick={() => router.push('/institution/settings')}
          >
            Settings
          </span>
          <span className={styles.breadcrumbSeparator}>&gt;</span>
          <span className={styles.breadcrumbCurrent}>Billing &amp; Plan</span>
        </div>

        {/* ── Header Row with Banner Card ─────────────────────────────────────── */}
        <div className={styles.headerRow}>
          <div className={styles.titleGroup}>
            <h1 className={styles.pageTitle}>Billing &amp; Plan</h1>
            <p className={styles.pageSubtitle}>
              Manage your subscription, view usage, invoices and payment methods.
            </p>
          </div>

          {/* Top Amber Highlight Banner */}
          <div className={styles.upgradeBannerCard}>
            <div className={styles.upgradeBannerLeft}>
              <div className={styles.upgradeCrownIconBox}>
                <Crown size={20} />
              </div>
              <div className={styles.upgradeBannerText}>
                <div className={styles.upgradeBannerTitle}>You&apos;re on NexLab Pro!</div>
                <div className={styles.upgradeBannerDesc}>
                  Unlock more power for your institution with advanced features.
                </div>
              </div>
            </div>

            <button
              type="button"
              className={styles.upgradeBannerBtn}
              onClick={() => {
                if (plansSectionRef.current) {
                  plansSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }}
            >
              Upgrade Plan
            </button>
          </div>
        </div>

        {/* ── Sub-Navigation Tabs Row ────────────────────────────────────────── */}
        <div className={styles.tabsRow}>
          {[
            { id: 'overview', label: 'Overview', Icon: FileText },
            { id: 'plans', label: 'Plans', Icon: Crown },
            { id: 'invoices', label: 'Invoices', Icon: FileText },
            { id: 'payment_methods', label: 'Payment Methods', Icon: CreditCard },
            { id: 'usage', label: 'Usage & Limits', Icon: BarChart3 },
            { id: 'settings', label: 'Billing Settings', Icon: Edit },
          ].map((tabItem) => (
            <button
              key={tabItem.id}
              type="button"
              className={`${styles.tabItem} ${activeTab === tabItem.id ? styles.tabItemActive : ''}`}
              onClick={() => handleTabClick(tabItem.id as SubTab)}
            >
              <tabItem.Icon size={14} />
              <span>{tabItem.label}</span>
            </button>
          ))}
        </div>

        {/* ── Main Content Grid ──────────────────────────────────────────────── */}
        <div className={styles.contentGrid}>
          {/* ════ LEFT COLUMN ════ */}
          <div className={styles.leftColumn}>
            {/* Top Dual Cards Row (Current Plan + Plan Usage) */}
            <div className={styles.topDualRow}>
              {/* Card 1: Current Plan */}
              <div className={styles.currentPlanCard}>
                <div className={styles.planCardTop}>
                  <div className={styles.planBadgeAndTitle}>
                    <div className={styles.currentPlanBadge}>
                      <Crown size={14} />
                      <span>Current Plan</span>
                    </div>
                    <h2 className={styles.planTitle}>{plan.name}</h2>
                    <p className={styles.planDesc}>{plan.description}</p>
                  </div>

                  <div className={styles.planPriceCol}>
                    <div className={styles.planPrice}>
                      {plan.currency}{plan.price.toLocaleString()}
                      <span className={styles.planPricePeriod}> / month</span>
                    </div>
                    <div className={styles.planBillingDate}>
                      Next billing date: {plan.next_billing_date}
                    </div>
                  </div>
                </div>

                <div className={styles.planStatusRow}>
                  <div className={styles.activeStatusPill}>
                    <span style={{ fontSize: 9 }}>●</span>
                    <span>{plan.status === 'active' ? 'Active' : 'Inactive'}</span>
                  </div>
                </div>

                <div className={styles.planCardActions}>
                  <button
                    type="button"
                    className={styles.managePlanBtn}
                    onClick={() => setShowEditInfoModal(true)}
                  >
                    Manage Plan
                  </button>
                  <button
                    type="button"
                    className={styles.upgradePlanActionBtn}
                    onClick={() => {
                      if (plansSectionRef.current) {
                        plansSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }
                    }}
                  >
                    Upgrade Plan
                  </button>
                </div>

                <Crown size={140} className={styles.planWatermarkCrown} />
              </div>

              {/* Card 2: Plan Usage */}
              <div className={styles.planUsageCard}>
                <div className={styles.usageHeader}>
                  <div className={styles.usageTitleGroup}>
                    <h3 className={styles.usageTitle}>Plan Usage</h3>
                    <p className={styles.usageResetSub}>Resets on {usage.resets_on}</p>
                  </div>
                  <button
                    type="button"
                    className={styles.viewDetailedUsageLink}
                    onClick={() => setShowUsageModal(true)}
                  >
                    <span>View Detailed Usage</span>
                    <ChevronRight size={13} />
                  </button>
                </div>

                <div className={styles.usageMetersList}>
                  {/* Students Meter */}
                  <div className={styles.usageMeterItem}>
                    <div className={styles.meterIconBox}>
                      <Users size={16} />
                    </div>
                    <div className={styles.meterContent}>
                      <div className={styles.meterLabelsRow}>
                        <span className={styles.meterLabel}>Students</span>
                        <div>
                          <span className={styles.meterFraction}>{usage.students.used}</span>
                          <span className={styles.meterLimit}> / {usage.students.limit}</span>
                        </div>
                      </div>
                      <div className={styles.meterProgressBarBg}>
                        <div
                          className={styles.meterProgressBarFill}
                          style={{ width: `${usage.students.percent}%` }}
                        />
                      </div>
                    </div>
                    <div className={styles.meterPercent}>{usage.students.percent}%</div>
                  </div>

                  {/* Instructors Meter */}
                  <div className={styles.usageMeterItem}>
                    <div className={styles.meterIconBox}>
                      <User size={16} />
                    </div>
                    <div className={styles.meterContent}>
                      <div className={styles.meterLabelsRow}>
                        <span className={styles.meterLabel}>Instructors</span>
                        <div>
                          <span className={styles.meterFraction}>{usage.instructors.used}</span>
                          <span className={styles.meterLimit}> / {usage.instructors.limit}</span>
                        </div>
                      </div>
                      <div className={styles.meterProgressBarBg}>
                        <div
                          className={styles.meterProgressBarFill}
                          style={{ width: `${usage.instructors.percent}%` }}
                        />
                      </div>
                    </div>
                    <div className={styles.meterPercent}>{usage.instructors.percent}%</div>
                  </div>

                  {/* Subjects Meter */}
                  <div className={styles.usageMeterItem}>
                    <div className={styles.meterIconBox}>
                      <BookOpen size={16} />
                    </div>
                    <div className={styles.meterContent}>
                      <div className={styles.meterLabelsRow}>
                        <span className={styles.meterLabel}>Subjects</span>
                        <div>
                          <span className={styles.meterFraction}>{usage.subjects.used}</span>
                          <span className={styles.meterLimit}> / {usage.subjects.limit}</span>
                        </div>
                      </div>
                      <div className={styles.meterProgressBarBg}>
                        <div
                          className={styles.meterProgressBarFill}
                          style={{ width: `${usage.subjects.percent}%` }}
                        />
                      </div>
                    </div>
                    <div className={styles.meterPercent}>{usage.subjects.percent}%</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3: Choose the Right Plan */}
            <div ref={plansSectionRef} className={styles.plansMatrixCard}>
              <div className={styles.matrixHeader}>
                <div className={styles.matrixTitleGroup}>
                  <h3 className={styles.matrixTitle}>Choose the Right Plan</h3>
                  <p className={styles.matrixSubtitle}>
                    Upgrade or downgrade anytime. All plans include core lab management features.
                  </p>
                </div>

                <div className={styles.cycleToggleContainer}>
                  <div className={styles.cycleTogglePill}>
                    <button
                      type="button"
                      className={`${styles.cycleToggleBtn} ${
                        billingCycle === 'monthly' ? styles.cycleToggleBtnActive : ''
                      }`}
                      onClick={() => setBillingCycle('monthly')}
                    >
                      Monthly
                    </button>
                    <button
                      type="button"
                      className={`${styles.cycleToggleBtn} ${
                        billingCycle === 'yearly' ? styles.cycleToggleBtnActive : ''
                      }`}
                      onClick={() => setBillingCycle('yearly')}
                    >
                      Yearly
                    </button>
                  </div>
                  <span className={styles.saveBadge}>Save 20%</span>
                </div>
              </div>

              {/* 3 Columns Grid */}
              <div className={styles.planColsGrid}>
                {/* 1. Starter */}
                <div className={styles.planColCard}>
                  <div className={styles.planColTop}>
                    <div className={`${styles.planColIconBox} ${styles.planColIconPurple}`}>
                      <GraduationCap size={20} />
                    </div>
                    <div className={styles.planColName}>Starter</div>
                    <div className={styles.planColSubtitle}>
                      Perfect for small institutions getting started.
                    </div>

                    <div className={styles.planColPriceBox}>
                      <span className={styles.planColPriceAmount}>
                        ₹{billingCycle === 'yearly' ? '1,599' : '1,999'}
                      </span>
                      <span className={styles.planColPricePeriod}>/ month</span>
                    </div>

                    <ul className={styles.planFeaturesList}>
                      <li className={styles.planFeatureItem}>
                        <Check size={15} className={styles.planFeatureCheck} />
                        <span>Up to 100 students</span>
                      </li>
                      <li className={styles.planFeatureItem}>
                        <Check size={15} className={styles.planFeatureCheck} />
                        <span>Up to 10 instructors</span>
                      </li>
                      <li className={styles.planFeatureItem}>
                        <Check size={15} className={styles.planFeatureCheck} />
                        <span>Basic analytics</span>
                      </li>
                      <li className={styles.planFeatureItem}>
                        <Check size={15} className={styles.planFeatureCheck} />
                        <span>Email support</span>
                      </li>
                    </ul>
                  </div>

                  {plan.id === 'starter' ? (
                    <button type="button" className={styles.currentPlanBtn}>
                      Current Plan
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.selectPlanBtn}
                      onClick={() => handleSelectPlan('starter')}
                      disabled={updatingPlan}
                    >
                      {updatingPlan ? 'Updating…' : 'Select Plan'}
                    </button>
                  )}
                </div>

                {/* 2. Pro (Featured / Current) */}
                <div className={`${styles.planColCard} ${styles.planColFeatured}`}>
                  <div className={styles.popularBadge}>Most Popular</div>
                  <div className={styles.planColTop}>
                    <div className={`${styles.planColIconBox} ${styles.planColIconGold}`}>
                      <Crown size={20} />
                    </div>
                    <div className={styles.planColName}>Pro</div>
                    <div className={styles.planColSubtitle}>
                      For growing institutions with advanced needs.
                    </div>

                    <div className={styles.planColPriceBox}>
                      <span className={styles.planColPriceAmount}>
                        ₹{billingCycle === 'yearly' ? '3,999' : '4,999'}
                      </span>
                      <span className={styles.planColPricePeriod}>/ month</span>
                    </div>

                    <ul className={styles.planFeaturesList}>
                      <li className={styles.planFeatureItem}>
                        <Check size={15} className={styles.planFeatureCheck} />
                        <span>Up to 500 students</span>
                      </li>
                      <li className={styles.planFeatureItem}>
                        <Check size={15} className={styles.planFeatureCheck} />
                        <span>Up to 50 instructors</span>
                      </li>
                      <li className={styles.planFeatureItem}>
                        <Check size={15} className={styles.planFeatureCheck} />
                        <span>Advanced analytics</span>
                      </li>
                      <li className={styles.planFeatureItem}>
                        <Check size={15} className={styles.planFeatureCheck} />
                        <span>Priority support</span>
                      </li>
                      <li className={styles.planFeatureItem}>
                        <Check size={15} className={styles.planFeatureCheck} />
                        <span>Custom branding</span>
                      </li>
                      <li className={styles.planFeatureItem}>
                        <Check size={15} className={styles.planFeatureCheck} />
                        <span>API access</span>
                      </li>
                    </ul>
                  </div>

                  {plan.id === 'pro' ? (
                    <button type="button" className={styles.currentPlanBtn}>
                      Current Plan
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.selectPlanBtn}
                      onClick={() => handleSelectPlan('pro')}
                      disabled={updatingPlan}
                    >
                      {updatingPlan ? 'Updating…' : 'Select Plan'}
                    </button>
                  )}
                </div>

                {/* 3. Enterprise */}
                <div className={styles.planColCard}>
                  <div className={styles.planColTop}>
                    <div className={`${styles.planColIconBox} ${styles.planColIconPurple}`}>
                      <Building2 size={20} />
                    </div>
                    <div className={styles.planColName}>Enterprise</div>
                    <div className={styles.planColSubtitle}>
                      For large institutions with custom requirements.
                    </div>

                    <div className={styles.planColPriceBox}>
                      <span className={styles.planColPriceAmount}>Custom</span>
                    </div>

                    <ul className={styles.planFeaturesList}>
                      <li className={styles.planFeatureItem}>
                        <Check size={15} className={styles.planFeatureCheck} />
                        <span>Unlimited students</span>
                      </li>
                      <li className={styles.planFeatureItem}>
                        <Check size={15} className={styles.planFeatureCheck} />
                        <span>Unlimited instructors</span>
                      </li>
                      <li className={styles.planFeatureItem}>
                        <Check size={15} className={styles.planFeatureCheck} />
                        <span>Dedicated support</span>
                      </li>
                      <li className={styles.planFeatureItem}>
                        <Check size={15} className={styles.planFeatureCheck} />
                        <span>SSO / SAML</span>
                      </li>
                      <li className={styles.planFeatureItem}>
                        <Check size={15} className={styles.planFeatureCheck} />
                        <span>On-premise option</span>
                      </li>
                      <li className={styles.planFeatureItem}>
                        <Check size={15} className={styles.planFeatureCheck} />
                        <span>Custom integrations</span>
                      </li>
                    </ul>
                  </div>

                  <button
                    type="button"
                    className={styles.contactSalesBtn}
                    onClick={() => setShowContactModal(true)}
                  >
                    Contact Sales
                  </button>
                </div>
              </div>
            </div>

            {/* Card 4: Recent Invoices */}
            <div ref={invoicesSectionRef} className={styles.invoicesCard}>
              <div className={styles.invoicesHeader}>
                <h3 className={styles.invoicesTitle}>Recent Invoices</h3>
                <button
                  type="button"
                  className={styles.viewAllLink}
                  onClick={() => showToast('Displaying full invoice history.')}
                >
                  <span>View All</span>
                  <ChevronRight size={13} />
                </button>
              </div>

              {recentInvoices.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontSize: 13 }}>
                  No recent invoices found.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className={styles.invoicesTable}>
                    <thead>
                      <tr>
                        <th>Invoice #</th>
                        <th>Date</th>
                        <th>Plan</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentInvoices.map((inv) => (
                        <tr key={inv.id}>
                          <td className={styles.invoiceNumber}>{inv.invoice_number}</td>
                          <td>{inv.date}</td>
                          <td>{inv.plan}</td>
                          <td style={{ fontWeight: 600 }}>{inv.amount_formatted}</td>
                          <td>
                            <span className={styles.paidStatusBadge}>
                              <span style={{ fontSize: 9 }}>●</span>
                              <span>{inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}</span>
                            </span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className={styles.downloadInvoiceBtn}
                              onClick={() => handleDownloadInvoice(inv)}
                              disabled={downloadingInvId === inv.id}
                            >
                              {downloadingInvId === inv.id ? (
                                <Loader2 size={13} className={styles.spin} />
                              ) : (
                                <Download size={13} />
                              )}
                              <span>Download</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* ════ RIGHT COLUMN ════ */}
          <div className={styles.rightColumn}>
            {/* Card 1: Billing Information */}
            <div className={styles.sideSectionCard}>
              <div className={styles.sideCardHeader}>
                <h3 className={styles.sideCardTitle}>Billing Information</h3>
                <button
                  type="button"
                  className={styles.editBtn}
                  onClick={() => setShowEditInfoModal(true)}
                >
                  <Edit size={12} />
                  <span>Edit</span>
                </button>
              </div>

              <div className={styles.billingInfoList}>
                <div className={styles.billingInfoItem}>
                  <Building2 size={16} className={styles.infoIconBox} />
                  <div className={styles.infoContent}>
                    <span className={styles.infoLabel}>Institution Name</span>
                    <span className={styles.infoValue}>{billingInfo.institution_name}</span>
                  </div>
                </div>

                <div className={styles.billingInfoItem}>
                  <Mail size={16} className={styles.infoIconBox} />
                  <div className={styles.infoContent}>
                    <span className={styles.infoLabel}>Billing Email</span>
                    <span className={styles.infoValue}>{billingInfo.billing_email}</span>
                  </div>
                </div>

                <div className={styles.billingInfoItem}>
                  <User size={16} className={styles.infoIconBox} />
                  <div className={styles.infoContent}>
                    <span className={styles.infoLabel}>Contact Person</span>
                    <span className={styles.infoValue}>{billingInfo.contact_person}</span>
                  </div>
                </div>

                <div className={styles.billingInfoItem}>
                  <Phone size={16} className={styles.infoIconBox} />
                  <div className={styles.infoContent}>
                    <span className={styles.infoLabel}>Phone Number</span>
                    <span className={styles.infoValue}>{billingInfo.phone}</span>
                  </div>
                </div>

                <div className={styles.billingInfoItem}>
                  <MapPin size={16} className={styles.infoIconBox} />
                  <div className={styles.infoContent}>
                    <span className={styles.infoLabel}>Address</span>
                    <span className={styles.infoValue}>{billingInfo.address}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: Payment Methods */}
            <div ref={paymentMethodsSectionRef} className={styles.sideSectionCard}>
              <div className={styles.sideCardHeader}>
                <h3 className={styles.sideCardTitle}>Payment Methods</h3>
                <button
                  type="button"
                  className={styles.addCardBtn}
                  onClick={() => setShowAddCardModal(true)}
                >
                  <Plus size={12} />
                  <span>Add New</span>
                </button>
              </div>

              {/* Stored Card Tile */}
              {paymentMethods.length > 0 ? (
                paymentMethods.map((pm) => (
                  <div key={pm.id} className={styles.cardTile}>
                    <div className={styles.cardTileLeft}>
                      <span className={styles.cardBrandBadge}>{pm.card_brand || 'VISA'}</span>
                      <div className={styles.cardDetails}>
                        <div className={styles.cardMask}>•••• {pm.last4}</div>
                        <div className={styles.cardExpiry}>Expires {pm.expiry}</div>
                      </div>
                    </div>

                    <div className={styles.cardTileRight}>
                      {pm.is_default && <span className={styles.defaultPill}>Default</span>}
                    </div>
                  </div>
                ))
              ) : (
                <div className={styles.cardTile}>
                  <div className={styles.cardTileLeft}>
                    <span className={styles.cardBrandBadge}>VISA</span>
                    <div className={styles.cardDetails}>
                      <div className={styles.cardMask}>•••• 4242</div>
                      <div className={styles.cardExpiry}>Expires 04/2028</div>
                    </div>
                  </div>
                  <div className={styles.cardTileRight}>
                    <span className={styles.defaultPill}>Default</span>
                  </div>
                </div>
              )}

              {/* Auto-Renewal Box */}
              <div className={styles.autoRenewalBox}>
                <div className={styles.autoRenewalLeft}>
                  <RefreshCw size={18} className={styles.autoRenewalIconBox} />
                  <div className={styles.autoRenewalText}>
                    <div className={styles.autoRenewalTitle}>Auto-Renewal</div>
                    <div className={styles.autoRenewalDesc}>
                      Your subscription will automatically renew on {plan.next_billing_date}. You&apos;ll be charged {plan.currency}{plan.price.toLocaleString()}.
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className={`${styles.toggleSwitch} ${
                    plan.auto_renewal ? styles.toggleSwitchOn : styles.toggleSwitchOff
                  }`}
                  onClick={handleToggleAutoRenewal}
                  disabled={togglingAutoRenewal}
                >
                  <span
                    className={`${styles.toggleSlider} ${
                      plan.auto_renewal ? styles.toggleSliderOn : styles.toggleSliderOff
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Card 3: Quick Actions */}
            <div className={styles.sideSectionCard}>
              <h3 className={styles.sideCardTitle} style={{ marginBottom: 14 }}>
                Quick Actions
              </h3>

              <div className={styles.quickActionsList}>
                <div
                  className={styles.quickActionItem}
                  onClick={() => {
                    if (recentInvoices.length > 0) {
                      handleDownloadInvoice(recentInvoices[0]);
                    } else {
                      showToast('No invoices to download.');
                    }
                  }}
                >
                  <div className={styles.quickActionLeft}>
                    <Download size={15} className={styles.quickActionIcon} />
                    <span>Download Invoices</span>
                  </div>
                  <ChevronRight size={14} color="#94a3b8" />
                </div>

                <div
                  className={styles.quickActionItem}
                  onClick={() => setShowEditInfoModal(true)}
                >
                  <div className={styles.quickActionLeft}>
                    <Edit size={15} className={styles.quickActionIcon} />
                    <span>Update Billing Information</span>
                  </div>
                  <ChevronRight size={14} color="#94a3b8" />
                </div>

                <div
                  className={styles.quickActionItem}
                  onClick={() => setShowUsageModal(true)}
                >
                  <div className={styles.quickActionLeft}>
                    <BarChart3 size={15} className={styles.quickActionIcon} />
                    <span>View Usage Reports</span>
                  </div>
                  <ChevronRight size={14} color="#94a3b8" />
                </div>

                <div
                  className={styles.quickActionItem}
                  onClick={() => setShowContactModal(true)}
                >
                  <div className={styles.quickActionLeft}>
                    <HelpCircle size={15} className={styles.quickActionIcon} />
                    <span>Contact Support</span>
                  </div>
                  <ChevronRight size={14} color="#94a3b8" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Modal: Edit Billing Information ───────────────────────────────── */}
        {showEditInfoModal && (
          <div className={styles.modalOverlay} onClick={() => setShowEditInfoModal(false)}>
            <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle}>Edit Billing Information</h3>
                <button
                  type="button"
                  className={styles.modalCloseBtn}
                  onClick={() => setShowEditInfoModal(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveBillingInfo}>
                <div className={styles.modalBody}>
                  <div className={styles.formField}>
                    <label className={styles.fieldLabel}>Billing Email Address</label>
                    <input
                      type="email"
                      required
                      className={styles.textInput}
                      value={editInfoForm.billing_email}
                      onChange={(e) =>
                        setEditInfoForm({ ...editInfoForm, billing_email: e.target.value })
                      }
                    />
                  </div>

                  <div className={styles.formField}>
                    <label className={styles.fieldLabel}>Contact Person</label>
                    <input
                      type="text"
                      required
                      className={styles.textInput}
                      value={editInfoForm.contact_person}
                      onChange={(e) =>
                        setEditInfoForm({ ...editInfoForm, contact_person: e.target.value })
                      }
                    />
                  </div>

                  <div className={styles.formField}>
                    <label className={styles.fieldLabel}>Phone Number</label>
                    <input
                      type="text"
                      required
                      className={styles.textInput}
                      value={editInfoForm.phone}
                      onChange={(e) =>
                        setEditInfoForm({ ...editInfoForm, phone: e.target.value })
                      }
                    />
                  </div>

                  <div className={styles.formField}>
                    <label className={styles.fieldLabel}>Registered Billing Address</label>
                    <textarea
                      rows={3}
                      required
                      className={styles.textInput}
                      value={editInfoForm.address}
                      onChange={(e) =>
                        setEditInfoForm({ ...editInfoForm, address: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className={styles.modalFooter}>
                  <button
                    type="button"
                    className={styles.cancelBtn}
                    onClick={() => setShowEditInfoModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={styles.saveModalBtn}
                    disabled={savingInfo}
                  >
                    {savingInfo ? <Loader2 size={14} className={styles.spin} /> : <Check size={14} />}
                    <span>Save Changes</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Modal: Add Payment Method ─────────────────────────────────────── */}
        {showAddCardModal && (
          <div className={styles.modalOverlay} onClick={() => setShowAddCardModal(false)}>
            <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle}>Add Payment Method</h3>
                <button
                  type="button"
                  className={styles.modalCloseBtn}
                  onClick={() => setShowAddCardModal(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleAddCard}>
                <div className={styles.modalBody}>
                  <div className={styles.formField}>
                    <label className={styles.fieldLabel}>Cardholder Name</label>
                    <input
                      type="text"
                      required
                      className={styles.textInput}
                      value={cardForm.cardholder_name}
                      onChange={(e) =>
                        setCardForm({ ...cardForm, cardholder_name: e.target.value })
                      }
                    />
                  </div>

                  <div className={styles.formField}>
                    <label className={styles.fieldLabel}>Card Number</label>
                    <input
                      type="text"
                      required
                      placeholder="4242 •••• •••• 4242"
                      className={styles.textInput}
                      value={cardForm.card_number}
                      onChange={(e) => setCardForm({ ...cardForm, card_number: e.target.value })}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className={styles.formField}>
                      <label className={styles.fieldLabel}>Expiry Month</label>
                      <input
                        type="text"
                        placeholder="MM (e.g. 04)"
                        required
                        className={styles.textInput}
                        value={cardForm.exp_month}
                        onChange={(e) => setCardForm({ ...cardForm, exp_month: e.target.value })}
                      />
                    </div>

                    <div className={styles.formField}>
                      <label className={styles.fieldLabel}>Expiry Year</label>
                      <input
                        type="text"
                        placeholder="YYYY (e.g. 2028)"
                        required
                        className={styles.textInput}
                        value={cardForm.exp_year}
                        onChange={(e) => setCardForm({ ...cardForm, exp_year: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div className={styles.modalFooter}>
                  <button
                    type="button"
                    className={styles.cancelBtn}
                    onClick={() => setShowAddCardModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={styles.saveModalBtn}
                    disabled={savingCard}
                  >
                    {savingCard ? <Loader2 size={14} className={styles.spin} /> : <Plus size={14} />}
                    <span>Add Card</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Modal: Contact Enterprise Sales ──────────────────────────────── */}
        {showContactModal && (
          <div className={styles.modalOverlay} onClick={() => setShowContactModal(false)}>
            <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle}>Contact Enterprise Sales</h3>
                <button
                  type="button"
                  className={styles.modalCloseBtn}
                  onClick={() => setShowContactModal(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSendContact}>
                <div className={styles.modalBody}>
                  <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
                    Looking for custom student volume, dedicated servers, on-premise installation or SSO integrations?
                    Submit your requirement below.
                  </p>

                  <div className={styles.formField}>
                    <label className={styles.fieldLabel}>Institution Requirements</label>
                    <textarea
                      rows={4}
                      required
                      placeholder="Specify your expected student cohort size, custom lab environments, or timeline..."
                      className={styles.textInput}
                      value={contactMsg}
                      onChange={(e) => setContactMsg(e.target.value)}
                    />
                  </div>
                </div>

                <div className={styles.modalFooter}>
                  <button
                    type="button"
                    className={styles.cancelBtn}
                    onClick={() => setShowContactModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={styles.saveModalBtn}
                    disabled={sendingContact}
                  >
                    {sendingContact ? <Loader2 size={14} className={styles.spin} /> : <Send size={14} />}
                    <span>Submit Inquiry</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Modal: Detailed Usage Breakdown ───────────────────────────────── */}
        {showUsageModal && (
          <div className={styles.modalOverlay} onClick={() => setShowUsageModal(false)}>
            <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle}>Detailed Usage &amp; Limits</h3>
                <button
                  type="button"
                  className={styles.modalCloseBtn}
                  onClick={() => setShowUsageModal(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <div className={styles.modalBody}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700 }}>
                      <span>Student Seats</span>
                      <span>{usage.students.used} / {usage.students.limit} seats</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                      Active student accounts enrolled across all academic sections.
                    </div>
                  </div>

                  <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700 }}>
                      <span>Instructor Seats</span>
                      <span>{usage.instructors.used} / {usage.instructors.limit} seats</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                      Faculty and lab conductors with experiment authoring access.
                    </div>
                  </div>

                  <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700 }}>
                      <span>Subjects &amp; Course Labs</span>
                      <span>{usage.subjects.used} / {usage.subjects.limit} active</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                      Total course laboratories configured with virtual execution profiles.
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.saveModalBtn}
                  onClick={() => setShowUsageModal(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Toast Alert ───────────────────────────────────────────────────── */}
        {toastMessage && (
          <div className={styles.toastNotice}>
            <CheckCircle2 size={16} color="#34d399" />
            <span>{toastMessage}</span>
          </div>
        )}
      </div>
    </InstitutionShell>
  );
}
