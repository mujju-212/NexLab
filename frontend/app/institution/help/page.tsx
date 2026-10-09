'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import InstitutionShell from '@/components/layout/InstitutionShell';
import {
  institutionService,
  type HelpTopicItem,
  type FAQItem,
  type SupportInfo,
  type HelpfulResourceItem,
  type SupportTicketItem,
  type HelpOverviewResponse,
  type CreateTicketPayload,
} from '@/services/institution.service';
import {
  Search,
  Rocket,
  Users,
  GraduationCap,
  BarChart3,
  CreditCard,
  ShieldCheck,
  HelpCircle,
  MessageSquare,
  Mail,
  Clock,
  FileText,
  Video,
  Code2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  ThumbsUp,
  ThumbsDown,
  Check,
  CheckCircle2,
  X,
  Send,
  Loader2,
  Bot,
  Calendar,
  Lock,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  Ticket,
  User,
  Bell,
  Cpu,
} from 'lucide-react';
import styles from './help.module.css';

// Mapping category IDs to icons
const getCategoryIcon = (category: string) => {
  switch (category) {
    case 'getting_started':
      return <Rocket size={18} />;
    case 'users':
      return <Users size={18} />;
    case 'academic':
      return <GraduationCap size={18} />;
    case 'analytics':
      return <BarChart3 size={18} />;
    case 'billing':
      return <CreditCard size={18} />;
    case 'security':
      return <ShieldCheck size={18} />;
    default:
      return <HelpCircle size={18} />;
  }
};

const getResourceIcon = (id: string) => {
  switch (id) {
    case 'user_guide':
      return <FileText size={16} />;
    case 'video_tutorials':
      return <Video size={16} />;
    case 'api_docs':
      return <Code2 size={16} />;
    case 'best_practices':
      return <Sparkles size={16} />;
    default:
      return <FileText size={16} />;
  }
};

const POPULAR_SEARCH_TAGS = [
  'Add students',
  'Schedule session',
  'Billing issues',
  'Reset password',
  'Download report',
];

interface ChatMessage {
  id: string;
  sender: 'bot' | 'user';
  text: string;
  timestamp: string;
}

export default function HelpFaqPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Overview Data
  const [loading, setLoading] = useState(true);
  const [topics, setTopics] = useState<HelpTopicItem[]>([]);
  const [popularSearches, setPopularSearches] = useState<string[]>(POPULAR_SEARCH_TAGS);
  const [supportInfo, setSupportInfo] = useState<SupportInfo>({
    live_chat: { available: true, status: 'online' },
    email: 'support@nexlab.in',
    support_hours: 'Mon - Sat 9:00 AM - 6:00 PM (IST)',
    avg_response_time: '< 2 hours',
  });
  const [resources, setResources] = useState<HelpfulResourceItem[]>([]);
  const [faqs, setFaqs] = useState<FAQItem[]>([]);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedFaqIds, setExpandedFaqIds] = useState<Set<string>>(new Set());
  const [ratedFaqs, setRatedFaqs] = useState<Record<string, 'helpful' | 'unhelpful'>>({});

  // Modals State
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [ticketForm, setTicketForm] = useState<CreateTicketPayload>({
    subject: '',
    category: 'general',
    priority: 'medium',
    message: '',
  });
  const [submittingTicket, setSubmittingTicket] = useState(false);

  // Tickets History Modal
  const [showTicketsListModal, setShowTicketsListModal] = useState(false);
  const [ticketsList, setTicketsList] = useState<SupportTicketItem[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);

  // Live Chat State
  const [showChatModal, setShowChatModal] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      sender: 'bot',
      text: 'Hello! I am your NexLab Support Assistant. How can I help you today with your institution management, students, or sessions?',
      timestamp: 'Just now',
    },
  ]);
  const [chatInput, setChatInput] = useState('');

  // Resource Detail Modal
  const [activeResource, setActiveResource] = useState<HelpfulResourceItem | null>(null);

  // Toast Notice State
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const faqSectionRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3800);
  };

  // Fetch help overview from backend API — through the react-query cache,
  // keyed by category+query: coming back to a previously-viewed filter is
  // instant, and repeated searches don't re-hit the server.
  const fetchOverview = async (categoryFilter?: string, query?: string) => {
    try {
      setLoading(true);
      const cat = categoryFilter && categoryFilter !== 'all' ? categoryFilter : undefined;
      const q = query && query.trim().length > 0 ? query.trim() : undefined;
      const data: HelpOverviewResponse = await queryClient.fetchQuery({
        queryKey: ['institution', 'help-overview', cat ?? '', q ?? ''],
        queryFn: () => institutionService.getHelpOverview({ category: cat, q }),
        staleTime: 5 * 60 * 1000, // FAQ/help content is essentially static
      });
      
      if (data.topics) setTopics(data.topics);
      if (data.popular_searches && data.popular_searches.length > 0) {
        setPopularSearches(data.popular_searches);
      }
      if (data.support_info) setSupportInfo(data.support_info);
      if (data.resources) setResources(data.resources);
      if (data.faqs) {
        setFaqs(data.faqs);
        // By default, open the first 2 FAQs if none are open
        if (expandedFaqIds.size === 0 && data.faqs.length > 0) {
          setExpandedFaqIds(new Set([data.faqs[0].id, data.faqs[1]?.id].filter(Boolean)));
        }
      }
    } catch (err: any) {
      console.error('Failed to load help overview:', err);
      showToast('Could not load help topics. Please try refreshing.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview(selectedCategory, searchQuery);
  }, [selectedCategory]);

  // Handle Search Submission
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchOverview(selectedCategory, searchQuery);
    if (faqSectionRef.current) {
      faqSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Click on popular search pill
  const handlePopularTagClick = (tag: string) => {
    setSearchQuery(tag);
    fetchOverview(selectedCategory, tag);
    if (faqSectionRef.current) {
      faqSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Click on topic card
  const handleTopicCardClick = (topicId: string) => {
    setSelectedCategory(topicId);
    if (faqSectionRef.current) {
      faqSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Clear category filter
  const handleViewAllArticles = () => {
    setSelectedCategory('all');
    setSearchQuery('');
    fetchOverview('all', '');
  };

  // Accordion toggle
  const toggleFaq = (id: string) => {
    setExpandedFaqIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Rate FAQ helpfulness
  const handleRateFaq = async (faqId: string, helpful: boolean) => {
    if (ratedFaqs[faqId]) {
      showToast('You have already submitted feedback for this article.');
      return;
    }

    try {
      const res = await institutionService.rateFAQ(faqId, helpful);
      setRatedFaqs((prev) => ({ ...prev, [faqId]: helpful ? 'helpful' : 'unhelpful' }));
      setFaqs((prev) =>
        prev.map((item) =>
          item.id === faqId
            ? {
                ...item,
                helpful_count: res.helpful_count,
                unhelpful_count: res.unhelpful_count,
              }
            : item
        )
      );
      showToast(helpful ? 'Thank you! Marked as helpful.' : 'Feedback recorded. We will improve this guide.');
    } catch (err: any) {
      console.error('Failed to rate FAQ:', err);
      showToast('Could not record your rating. Please try again.');
    }
  };

  // Create Support Ticket Submit
  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketForm.subject.trim() || !ticketForm.message.trim()) {
      showToast('Please fill in both subject and description.');
      return;
    }

    try {
      setSubmittingTicket(true);
      const res = await institutionService.createSupportTicket(ticketForm);
      showToast(`Support Ticket #${res.ticket.ticket_number} created successfully! Our team will follow up.`);
      setShowTicketModal(false);
      setTicketForm({
        subject: '',
        category: 'general',
        priority: 'medium',
        message: '',
      });
    } catch (err: any) {
      console.error('Create ticket failed:', err);
      showToast(err?.response?.data?.error || 'Failed to submit support ticket.');
    } finally {
      setSubmittingTicket(false);
    }
  };

  // Load Tickets History
  const handleOpenTicketsList = async () => {
    setShowTicketsListModal(true);
    try {
      setLoadingTickets(true);
      const res = await institutionService.getSupportTickets();
      setTicketsList(res.tickets || []);
    } catch (err) {
      console.error('Failed to fetch tickets:', err);
      showToast('Could not load existing tickets.');
    } finally {
      setLoadingTickets(false);
    }
  };

  // Interactive Live Chat Send Message
  const handleSendChatMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userText = chatInput.trim();
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: userText,
      timestamp: 'Just now',
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput('');

    // Generate intelligent bot response
    setTimeout(() => {
      let botResponse = "Thank you for reaching out! Our support team has logged your inquiry. Would you like to raise a high-priority ticket for our technical team?";
      const lower = userText.toLowerCase();

      if (lower.includes('student') || lower.includes('bulk')) {
        botResponse = "To add students in bulk, navigate to 'User Management' and click 'Bulk Upload CSV'. Ensure your CSV file includes columns: Full Name, Email, Role, and Roll Number.";
      } else if (lower.includes('billing') || lower.includes('plan') || lower.includes('invoice')) {
        botResponse = "You can manage your subscription, download GST-compliant invoices, and update billing details under the 'Plan & Billing' tab.";
      } else if (lower.includes('password') || lower.includes('reset') || lower.includes('login')) {
        botResponse = "Admins can reset any user's credentials directly from User Management -> click the user row -> 'Reset Password'. Users will receive a temporary login credential.";
      } else if (lower.includes('session') || lower.includes('schedule') || lower.includes('live')) {
        botResponse = "To schedule sessions, head over to the Sessions section or Planner. You can schedule individual or recurring sessions for any batch and section.";
      }

      const replyMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'bot',
        text: botResponse,
        timestamp: 'Just now',
      };
      setChatMessages((prev) => [...prev, replyMsg]);
    }, 600);
  };

  return (
    <InstitutionShell activePage="Institution Settings">
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
          <span className={styles.breadcrumbCurrent}>Help &amp; FAQ</span>
        </div>

        {/* ── Top Header Row with Banner Card ─────────────────────────────────── */}
        <div className={styles.headerRow}>
          <div className={styles.titleGroup}>
            <h1 className={styles.pageTitle}>Help &amp; FAQ</h1>
            <p className={styles.pageSubtitle}>
              Find answers, get support, and make the most of NexLab.
            </p>
          </div>

          {/* Top Right Support Robot Banner Card */}
          <div
            className={styles.supportBannerCard}
            style={{ cursor: 'pointer' }}
            onClick={() => setShowChatModal(true)}
            title="Click to start live chat with NexLab Assistant"
          >
            <div className={styles.supportBannerText}>
              <div className={styles.supportBannerTitle}>Need help?</div>
              <div className={styles.supportBannerHeadline}>We&apos;re here for you!</div>
              <div className={styles.supportBannerSub}>Get support anytime from our team.</div>
            </div>

            <div className={styles.robotIllustrationBox}>
              <div className={styles.robotSpeechBubble}>Hi! How can I help?</div>
              <div className={styles.robotAvatar}>
                <Bot size={24} />
              </div>
            </div>
          </div>
        </div>

        {/* ── Sub-Navigation Tabs Row ────────────────────────────────────────── */}
        <div className={styles.tabsRow}>
          <button
            type="button"
            className={styles.tabItem}
            onClick={() => router.push('/institution/profile')}
          >
            <User size={15} />
            <span>Profile &amp; Security</span>
          </button>

          <button
            type="button"
            className={styles.tabItem}
            onClick={() => router.push('/institution/notifications')}
          >
            <Bell size={15} />
            <span>Notifications</span>
          </button>

          <button
            type="button"
            className={styles.tabItem}
            onClick={() => router.push('/institution/billing')}
          >
            <CreditCard size={15} />
            <span>Plan &amp; Billing</span>
          </button>

          <button
            type="button"
            className={styles.tabItem}
            onClick={() => router.push('/institution/ai-usage')}
          >
            <Cpu size={15} />
            <span>AI &amp; Usage</span>
          </button>

          <button
            type="button"
            className={`${styles.tabItem} ${styles.tabItemActive}`}
          >
            <HelpCircle size={15} />
            <span>Help &amp; FAQ</span>
          </button>
        </div>

        {/* ── Main Content Grid ──────────────────────────────────────────────── */}
        <div className={styles.contentGrid}>
          {/* ════ LEFT COLUMN ════ */}
          <div className={styles.leftColumn}>
            {/* 1. Search Hero Card */}
            <div className={styles.searchHeroCard}>
              <div className={styles.searchHeroContent}>
                <h2 className={styles.searchHeroTitle}>How can we help you?</h2>
                <p className={styles.searchHeroSubtitle}>
                  Search for answers, browse topics, or get in touch with our support team.
                </p>

                {/* Search Input Bar */}
                <form onSubmit={handleSearchSubmit} className={styles.searchBarWrapper}>
                  <Search size={18} className={styles.searchIcon} />
                  <input
                    type="text"
                    className={styles.searchInput}
                    placeholder='Search for help (e.g. "add students", "billing", "API")'
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <button type="submit" className={styles.searchSubmitBtn}>
                    Search
                  </button>
                </form>

                {/* Popular Searches */}
                <div className={styles.popularSearchesRow}>
                  <span className={styles.popularLabel}>Popular searches:</span>
                  {popularSearches.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className={styles.popularTag}
                      onClick={() => handlePopularTagClick(tag)}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* 3D Document Illustration on the right */}
              <div className={styles.searchIllustrationBox}>
                <div
                  style={{
                    width: 90,
                    height: 90,
                    borderRadius: 18,
                    background: 'rgba(255, 255, 255, 0.65)',
                    backdropFilter: 'blur(8px)',
                    border: '2px solid #ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 8px 24px rgba(124, 58, 237, 0.12)',
                  }}
                >
                  <Sparkles size={46} color="#7c3aed" />
                </div>
              </div>
            </div>

            {/* 2. Browse Help Topics Card */}
            <div className={styles.sectionCard}>
              <div className={styles.cardHeader}>
                <div className={styles.cardTitleGroup}>
                  <h3 className={styles.cardTitle}>Browse Help Topics</h3>
                  <p className={styles.cardSubtitle}>
                    Explore guides and FAQs by category.
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.viewAllLink}
                  onClick={handleViewAllArticles}
                >
                  <span>View All Articles</span>
                  <ChevronRight size={13} />
                </button>
              </div>

              {/* 6 Topics Grid */}
              <div className={styles.topicsGrid}>
                {topics.map((topic) => (
                  <div
                    key={topic.id}
                    className={`${styles.topicCard} ${
                      selectedCategory === topic.id ? styles.topicCardActive : ''
                    }`}
                    onClick={() => handleTopicCardClick(topic.id)}
                  >
                    <div className={styles.topicIconBox}>
                      {getCategoryIcon(topic.id)}
                    </div>
                    <div className={styles.topicText}>
                      <div className={styles.topicTitle}>{topic.title}</div>
                      <div className={styles.topicDesc}>{topic.description}</div>
                      <div className={styles.topicArticleCount}>
                        {topic.article_count} articles
                      </div>
                    </div>
                    <ChevronRight size={14} className={styles.topicChevron} />
                  </div>
                ))}
              </div>
            </div>

            {/* 3. Frequently Asked Questions Card */}
            <div ref={faqSectionRef} className={styles.sectionCard}>
              <div className={styles.faqHeaderRow}>
                <div className={styles.cardTitleGroup}>
                  <h3 className={styles.cardTitle}>Frequently Asked Questions</h3>
                  <p className={styles.cardSubtitle}>
                    Quick answers to common questions about managing your institution.
                  </p>
                </div>

                {/* Category Dropdown */}
                <select
                  className={styles.categorySelectDropdown}
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                >
                  <option value="all">All Categories</option>
                  <option value="getting_started">Getting Started</option>
                  <option value="users">User Management</option>
                  <option value="academic">Academic &amp; Sessions</option>
                  <option value="analytics">Analytics &amp; Reports</option>
                  <option value="billing">Billing &amp; Subscription</option>
                  <option value="security">Account &amp; Security</option>
                </select>
              </div>

              {/* FAQ Accordion List */}
              {loading ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#7c3aed' }}>
                  <Loader2 size={26} className={styles.spin} style={{ margin: '0 auto 8px' }} />
                  <p style={{ fontSize: 13, color: '#64748b' }}>Loading knowledge base articles...</p>
                </div>
              ) : faqs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                  <AlertCircle size={32} color="#94a3b8" style={{ margin: '0 auto 10px' }} />
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#1e1b4b', margin: '0 0 4px' }}>
                    No matching articles found
                  </p>
                  <p style={{ fontSize: 12.5, margin: '0 0 14px' }}>
                    Try searching with different keywords or browse all categories.
                  </p>
                  <button
                    type="button"
                    className={styles.popularTag}
                    onClick={handleViewAllArticles}
                  >
                    Clear Filter
                  </button>
                </div>
              ) : (
                <div className={styles.faqList}>
                  {faqs.map((faq) => {
                    const isExpanded = expandedFaqIds.has(faq.id);
                    const userRating = ratedFaqs[faq.id];

                    return (
                      <div key={faq.id} className={styles.faqItem}>
                        {/* Question Row */}
                        <div
                          className={styles.faqQuestionRow}
                          onClick={() => toggleFaq(faq.id)}
                        >
                          <div className={styles.faqQuestionLeft}>
                            <div className={styles.faqCategoryIconBox}>
                              {getCategoryIcon(faq.category)}
                            </div>
                            <h4 className={styles.faqQuestionText}>{faq.question}</h4>
                          </div>

                          <div style={{ color: '#94a3b8', flexShrink: 0 }}>
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </div>
                        </div>

                        {/* Answer Body */}
                        {isExpanded && (
                          <div className={styles.faqAnswerBody}>
                            <p className={styles.faqAnswerText}>{faq.answer}</p>

                            {/* Live Rating Feedback Row */}
                            <div className={styles.faqFeedbackRow}>
                              <span>Was this helpful?</span>
                              <button
                                type="button"
                                className={styles.rateBtn}
                                style={
                                  userRating === 'helpful'
                                    ? { borderColor: '#10b981', color: '#10b981', background: '#ecfdf5' }
                                    : {}
                                }
                                onClick={() => handleRateFaq(faq.id, true)}
                              >
                                <ThumbsUp size={12} />
                                <span>Yes ({faq.helpful_count})</span>
                              </button>

                              <button
                                type="button"
                                className={styles.rateBtn}
                                style={
                                  userRating === 'unhelpful'
                                    ? { borderColor: '#ef4444', color: '#ef4444', background: '#fef2f2' }
                                    : {}
                                }
                                onClick={() => handleRateFaq(faq.id, false)}
                              >
                                <ThumbsDown size={12} />
                                <span>No ({faq.unhelpful_count})</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ════ RIGHT COLUMN (SIDEBAR) ════ */}
          <div className={styles.rightColumn}>
            {/* 1. Contact Support Card */}
            <div className={styles.sideSectionCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 className={styles.cardTitle} style={{ margin: 0 }}>Contact Support</h3>
                <div className={styles.onlineBadge}>
                  <span style={{ fontSize: 8 }}>●</span>
                  <span>Online</span>
                </div>
              </div>
              <p className={styles.cardSubtitle} style={{ marginTop: 4 }}>
                Our support team is available to help you.
              </p>

              {/* Channels List */}
              <div className={styles.channelsList}>
                {/* Channel 1: Live Chat */}
                <div className={styles.channelItem}>
                  <div className={styles.channelLeft}>
                    <div className={styles.channelIconBox}>
                      <MessageSquare size={17} />
                    </div>
                    <div>
                      <div className={styles.channelTitle}>Live Chat</div>
                      <div className={styles.channelSub}>Get instant help from our team</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={styles.channelBtn}
                    onClick={() => setShowChatModal(true)}
                  >
                    Start Chat
                  </button>
                </div>

                {/* Channel 2: Email Support */}
                <div className={styles.channelItem}>
                  <div className={styles.channelLeft}>
                    <div className={styles.channelIconBox}>
                      <Mail size={17} />
                    </div>
                    <div>
                      <div className={styles.channelTitle}>Email Support</div>
                      <div className={styles.channelSub}>{supportInfo.email}</div>
                    </div>
                  </div>
                  <a
                    href={`mailto:${supportInfo.email}?subject=NexLab%20Support%20Inquiry`}
                    className={styles.channelBtn}
                    style={{ textDecoration: 'none', display: 'inline-block' }}
                  >
                    Send Email
                  </a>
                </div>

                {/* Channel 3: Raise a Ticket */}
                <div className={styles.channelItem}>
                  <div className={styles.channelLeft}>
                    <div className={styles.channelIconBox}>
                      <Ticket size={17} />
                    </div>
                    <div>
                      <div className={styles.channelTitle}>Raise a Ticket</div>
                      <div className={styles.channelSub}>Submit a support request</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={styles.channelBtn}
                    onClick={() => setShowTicketModal(true)}
                  >
                    Create Ticket
                  </button>
                </div>
              </div>

              {/* Support Hours Box */}
              <div className={styles.supportHoursBox}>
                <Clock size={16} className={styles.supportHoursIcon} />
                <div className={styles.supportHoursDetails}>
                  <div className={styles.supportHoursRow}>
                    <span className={styles.supportHoursDays}>Mon - Sat</span>
                    <span className={styles.supportHoursTimes}>9:00 AM - 6:00 PM (IST)</span>
                  </div>
                  <div className={styles.supportResponseTime}>
                    Average response time: <strong>&lt; 2 hours</strong>
                  </div>
                </div>
              </div>

              {/* View Submitted Tickets Link */}
              <div style={{ marginTop: 14, textAlign: 'center' }}>
                <button
                  type="button"
                  onClick={handleOpenTicketsList}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#7c3aed',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Ticket size={13} />
                  <span>View Submitted Tickets</span>
                </button>
              </div>
            </div>

            {/* 2. Helpful Resources Card */}
            <div className={styles.sideSectionCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 className={styles.cardTitle} style={{ margin: 0 }}>Helpful Resources</h3>
                <button
                  type="button"
                  className={styles.viewAllLink}
                  onClick={() => {
                    if (resources.length > 0) setActiveResource(resources[0]);
                  }}
                >
                  <span>View All</span>
                  <ChevronRight size={13} />
                </button>
              </div>

              <div className={styles.resourcesList}>
                {resources.map((res) => (
                  <div
                    key={res.id}
                    className={styles.resourceItem}
                    onClick={() => setActiveResource(res)}
                  >
                    <div className={styles.resourceIconBox}>
                      {getResourceIcon(res.id)}
                    </div>
                    <div>
                      <div className={styles.resourceTitle}>{res.title}</div>
                      <div className={styles.resourceDesc}>{res.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. Still need help? Purple Card */}
            <div className={styles.stillNeedHelpCard}>
              <div className={styles.stillNeedHelpIconCircle}>
                <GraduationCap size={24} color="#ffffff" />
              </div>
              <h3 className={styles.stillNeedHelpTitle}>Still need help?</h3>
              <p className={styles.stillNeedHelpDesc}>
                Our team is just a message away. We&apos;re here to make your experience smooth.
              </p>
              <button
                type="button"
                className={styles.contactSupportBtn}
                onClick={() => setShowTicketModal(true)}
              >
                <span>Contact Support</span>
                <span style={{ marginLeft: 4 }}>&rarr;</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── MODAL 1: Raise Support Ticket ────────────────────────────────────── */}
        {showTicketModal && (
          <div className={styles.modalOverlay}>
            <div className={styles.modalCard}>
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle}>Raise a Support Ticket</h3>
                <button
                  type="button"
                  className={styles.modalCloseBtn}
                  onClick={() => setShowTicketModal(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleCreateTicket}>
                <div className={styles.modalBody}>
                  <div className={styles.formField}>
                    <label className={styles.fieldLabel}>Subject *</label>
                    <input
                      type="text"
                      className={styles.textInput}
                      placeholder="Brief summary of your issue or request"
                      value={ticketForm.subject}
                      onChange={(e) =>
                        setTicketForm({ ...ticketForm, subject: e.target.value })
                      }
                      required
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className={styles.formField}>
                      <label className={styles.fieldLabel}>Category</label>
                      <select
                        className={styles.textInput}
                        value={ticketForm.category}
                        onChange={(e) =>
                          setTicketForm({ ...ticketForm, category: e.target.value })
                        }
                      >
                        <option value="general">General Support</option>
                        <option value="users">User Management</option>
                        <option value="billing">Billing &amp; Invoices</option>
                        <option value="academic">Academic / Sessions</option>
                        <option value="technical">Technical Glitch</option>
                        <option value="security">Security &amp; 2FA</option>
                      </select>
                    </div>

                    <div className={styles.formField}>
                      <label className={styles.fieldLabel}>Priority</label>
                      <select
                        className={styles.textInput}
                        value={ticketForm.priority}
                        onChange={(e) =>
                          setTicketForm({ ...ticketForm, priority: e.target.value })
                        }
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                    </div>
                  </div>

                  <div className={styles.formField}>
                    <label className={styles.fieldLabel}>Description *</label>
                    <textarea
                      className={styles.textInput}
                      rows={5}
                      placeholder="Please describe the steps to reproduce or details of what you need assistance with..."
                      value={ticketForm.message}
                      onChange={(e) =>
                        setTicketForm({ ...ticketForm, message: e.target.value })
                      }
                      required
                      style={{ resize: 'vertical', fontFamily: 'inherit' }}
                    />
                  </div>
                </div>

                <div className={styles.modalFooter}>
                  <button
                    type="button"
                    className={styles.cancelBtn}
                    onClick={() => setShowTicketModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={styles.saveModalBtn}
                    disabled={submittingTicket}
                  >
                    {submittingTicket ? (
                      <>
                        <Loader2 size={14} className={styles.spin} />
                        <span>Submitting...</span>
                      </>
                    ) : (
                      <>
                        <Send size={14} />
                        <span>Submit Ticket</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── MODAL 2: Interactive Live Chat ───────────────────────────────────── */}
        {showChatModal && (
          <div className={styles.modalOverlay}>
            <div className={styles.modalCard} style={{ maxWidth: 480 }}>
              <div className={styles.modalHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: '#ede9fe',
                      color: '#7c3aed',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Bot size={18} />
                  </div>
                  <div>
                    <h3 className={styles.modalTitle}>NexLab Assistant</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#059669' }}>
                      <span>●</span>
                      <span>Online &bull; Available 24/7</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className={styles.modalCloseBtn}
                  onClick={() => setShowChatModal(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <div style={{ padding: '16px' }}>
                {/* Chat Messages */}
                <div className={styles.chatContainer}>
                  {chatMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`${styles.chatBubble} ${
                        msg.sender === 'bot' ? styles.botBubble : styles.userBubble
                      }`}
                    >
                      {msg.text}
                    </div>
                  ))}
                </div>

                {/* Input row */}
                <form onSubmit={handleSendChatMessage} className={styles.chatInputRow}>
                  <input
                    type="text"
                    className={styles.textInput}
                    style={{ flex: 1 }}
                    placeholder="Type your question..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                  />
                  <button type="submit" className={styles.chatSendBtn}>
                    <Send size={14} />
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* ── MODAL 3: Submitted Tickets History ────────────────────────────────── */}
        {showTicketsListModal && (
          <div className={styles.modalOverlay}>
            <div className={styles.modalCard} style={{ maxWidth: 580 }}>
              <div className={styles.modalHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Ticket size={18} color="#7c3aed" />
                  <h3 className={styles.modalTitle}>Your Support Tickets</h3>
                </div>
                <button
                  type="button"
                  className={styles.modalCloseBtn}
                  onClick={() => setShowTicketsListModal(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <div style={{ padding: '20px' }}>
                {loadingTickets ? (
                  <div style={{ textAlign: 'center', padding: '30px 0', color: '#7c3aed' }}>
                    <Loader2 size={24} className={styles.spin} style={{ margin: '0 auto 8px' }} />
                    <p style={{ fontSize: 13, color: '#64748b' }}>Fetching support tickets...</p>
                  </div>
                ) : ticketsList.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px 0', color: '#64748b' }}>
                    <Ticket size={32} color="#94a3b8" style={{ margin: '0 auto 10px' }} />
                    <p style={{ fontSize: 13.5, fontWeight: 600, color: '#1e1b4b' }}>
                      No support tickets yet
                    </p>
                    <p style={{ fontSize: 12 }}>
                      Any tickets you or your team submit will appear here.
                    </p>
                  </div>
                ) : (
                  <div className={styles.ticketsList}>
                    {ticketsList.map((t) => (
                      <div key={t.id} className={styles.ticketItemCard}>
                        <div className={styles.ticketItemHeader}>
                          <span className={styles.ticketItemNumber}>#{t.ticket_number}</span>
                          <span
                            className={`${styles.ticketBadge} ${
                              t.status === 'resolved'
                                ? styles.badgeResolved
                                : t.status === 'in_progress'
                                ? styles.badgeProgress
                                : styles.badgeOpen
                            }`}
                          >
                            {t.status.replace('_', ' ')}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1e1b4b' }}>
                          {t.subject}
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>
                          {t.message}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: '#94a3b8',
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginTop: 4,
                          }}
                        >
                          <span>Priority: {t.priority.toUpperCase()}</span>
                          <span>{t.formatted_date}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setShowTicketsListModal(false)}
                >
                  Close
                </button>
                <button
                  type="button"
                  className={styles.saveModalBtn}
                  onClick={() => {
                    setShowTicketsListModal(false);
                    setShowTicketModal(true);
                  }}
                >
                  <Ticket size={14} />
                  <span>Raise New Ticket</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── MODAL 4: Helpful Resource Guide ──────────────────────────────────── */}
        {activeResource && (
          <div className={styles.modalOverlay}>
            <div className={styles.modalCard}>
              <div className={styles.modalHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className={styles.resourceIconBox}>
                    {getResourceIcon(activeResource.id)}
                  </div>
                  <h3 className={styles.modalTitle}>{activeResource.title}</h3>
                </div>
                <button
                  type="button"
                  className={styles.modalCloseBtn}
                  onClick={() => setActiveResource(null)}
                >
                  <X size={18} />
                </button>
              </div>

              <div className={styles.modalBody}>
                <p style={{ fontSize: 13.5, color: '#475569', lineHeight: 1.6 }}>
                  {activeResource.description}. All comprehensive guides, API references, and video walkthroughs are continuously updated to help your institution optimize academic workflows.
                </p>

                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 10,
                    padding: '14px 16px',
                    fontSize: 12.5,
                    color: '#64748b',
                  }}
                >
                  <strong>Resource Link:</strong> {activeResource.link}
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setActiveResource(null)}
                >
                  Close
                </button>
                <button
                  type="button"
                  className={styles.saveModalBtn}
                  onClick={() => {
                    showToast(`Opening ${activeResource.title}...`);
                    setActiveResource(null);
                  }}
                >
                  <ExternalLink size={14} />
                  <span>Open Documentation</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Toast Notification Notice ────────────────────────────────────────── */}
        {toastMessage && (
          <div className={styles.toastNotice}>
            <CheckCircle2 size={16} color="#4ade80" />
            <span>{toastMessage}</span>
          </div>
        )}
      </div>
    </InstitutionShell>
  );
}
