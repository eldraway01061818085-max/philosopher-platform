
import React, { useEffect, useState } from 'react';
import { supabase, configured } from './supabase';

const grades = [
  'الصف الأول الثانوي',
  'الصف الثاني الثانوي',
  'الصف الثالث الثانوي',
  'أولى بكالوريا',
  'تانية ثانوي أزهر وعام وبكالوريا'
];

const governorates = [
  'القاهرة', 'الجيزة', 'الإسكندرية', 'القليوبية', 'البحيرة',
  'مطروح', 'كفر الشيخ', 'الغربية', 'المنوفية', 'الدقهلية',
  'دمياط', 'الشرقية', 'بورسعيد', 'الإسماعيلية', 'السويس',
  'شمال سيناء', 'جنوب سيناء', 'الفيوم', 'بني سويف', 'المنيا',
  'أسيوط', 'سوهاج', 'قنا', 'الأقصر', 'أسوان',
  'البحر الأحمر', 'الوادي الجديد'
];

const PHILOSOPHY_IMAGE = '/file_00000000f7a881f4b475ffb6768b5f12.png';
const PSYCHOLOGY_IMAGE = '/file_00000000e300820a824803dc05058f7d.png';
const TEACHER_IMAGE = '/IMG-20261103-WA0020.jpg';

const VODAFONE_CASH_NUMBER = '01064018499';
const PAYMENT_WHATSAPP = '201064018499';
const SUPPORT_WHATSAPP = '201061818085';

function getCourseImage(course) {
  const title = (course?.title || '').trim();

  if (/فلسفة|منطق/.test(title)) {
    return PHILOSOPHY_IMAGE;
  }

  if (/علم\s*نفس/.test(title)) {
    return PSYCHOLOGY_IMAGE;
  }

  return '';
}

function getErrorMessage(error) {
  return error?.message || 'حدث خطأ غير معروف. حاول مرة أخرى.';
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [tab, setTab] = useState('home');
  const [courses, setCourses] = useState([]);
  const [mySubs, setMySubs] = useState([]);
  const [pending, setPending] = useState([]);
  const [progressRows, setProgressRows] = useState([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [grade, setGrade] = useState(grades[0]);
  const [phone, setPhone] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [governorate, setGovernorate] = useState('');

  const [courseTitle, setCourseTitle] = useState('');
  const [courseGrade, setCourseGrade] = useState(grades[0]);
  const [price, setPrice] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [viewedCourse, setViewedCourse] = useState(null);

  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    if (!configured) return undefined;

    let mounted = true;

    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (mounted && !error) setSession(data.session);
      })
      .catch(error => {
        if (mounted) {
          setMsg('تعذر التحقق من تسجيل الدخول: ' + getErrorMessage(error));
        }
      });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) setSession(nextSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (configured) loadCourses();
  }, []);

  useEffect(() => {
    if (session) {
      loadProfile(session);
      if (selectedCourse) setTab('dashboard');
    } else {
      setProfile(null);
      setMySubs([]);
      setPending([]);
      setProgressRows([]);
    }
  }, [session]);

  useEffect(() => {
    if (isAdmin) loadPending();
  }, [isAdmin]);

  async function loadProfile(activeSession = session) {
    if (!activeSession) return;

    try {
      const userId = activeSession.user.id;
      const metadata = activeSession.user.user_metadata || {};
      const metadataUpdates = {};

      if (metadata.full_name) metadataUpdates.full_name = metadata.full_name;
      if (metadata.phone) metadataUpdates.phone = metadata.phone;
      if (metadata.guardian_phone) metadataUpdates.guardian_phone = metadata.guardian_phone;
      if (metadata.governorate) metadataUpdates.governorate = metadata.governorate;
      if (metadata.grade) metadataUpdates.grade = metadata.grade;

      if (Object.keys(metadataUpdates).length > 0) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update(metadataUpdates)
          .eq('id', userId);

        if (updateError) {
          console.warn('تعذرت مزامنة بيانات الملف الشخصي:', updateError.message);
        }
      }

      const [
        { data: profileData, error: profileError },
        { data: subs, error: subsError },
        { data: progress, error: progressError }
      ] = await Promise.all([
        supabase.from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle(),

        supabase.from('subscriptions')
          .select('*, courses(title,grade,price)')
          .eq('student_id', userId)
          .order('created_at', { ascending: false }),

        supabase.from('course_progress')
          .select('id,student_id,course_id,lesson_id,completed_at')
          .eq('student_id', userId)
      ]);

      if (profileError) {
        setMsg('تعذر تحميل الملف الشخصي: ' + profileError.message);
      } else {
        setProfile(profileData || {
          id: userId,
          full_name: metadata.full_name || '',
          email: activeSession.user.email || '',
          phone: metadata.phone || '',
          guardian_phone: metadata.guardian_phone || '',
          governorate: metadata.governorate || '',
          grade: metadata.grade || '',
          role: 'student'
        });
      }

      if (subsError) {
        setMsg('تعذر تحميل الاشتراكات: ' + subsError.message);
      } else {
        setMySubs(subs || []);
      }

      if (progressError) {
        setProgressRows([]);
        setMsg('تعذر تحميل تقدم الدروس: ' + progressError.message);
      } else {
        setProgressRows(progress || []);
      }
    } catch (error) {
      setMsg('حدث خطأ أثناء تحميل بيانات الحساب: ' + getErrorMessage(error));
    }
  }

  async function loadCourses() {
    try {
      const { data, error } = await supabase.from('courses')
        .select('*')
        .eq('active', true)
        .order('created_at', { ascending: false });

      if (error) {
        setMsg('تعذر تحميل الكورسات: ' + error.message);
      } else {
        setCourses(data || []);
      }
    } catch (error) {
      setMsg('حدث خطأ أثناء تحميل الكورسات: ' + getErrorMessage(error));
    }
  }

  async function loadPending() {
    if (!isAdmin) return;

    try {
      const { data, error } = await supabase.from('subscriptions')
        .select('*, profiles(full_name,email,phone,guardian_phone,governorate), courses(title,grade,price)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

      if (error) {
        setMsg('تعذر تحميل طلبات الاشتراك: ' + error.message);
      } else {
        setPending(data || []);
      }
    } catch (error) {
      setMsg('حدث خطأ أثناء تحميل الطلبات: ' + getErrorMessage(error));
    }
  }

  async function markLessonViewed(courseId, lessonId) {
    if (!session?.user?.id) {
      setMsg('سجّل الدخول أولاً.');
      return;
    }

    const hasApprovedSubscription = mySubs.some(
      s => s.course_id === courseId && s.status === 'approved'
    );

    if (!hasApprovedSubscription) {
      setMsg('هذا الدرس متاح للطلاب المشتركين في الكورس فقط.');
      return;
    }

    const alreadyDone = progressRows.some(
      row => row.lesson_id === lessonId && row.course_id === courseId
    );

    if (alreadyDone) {
      setMsg('تم تسجيل مشاهدة هذا الدرس من قبل.');
      return;
    }

    setBusy(true);
    setMsg('');

    try {
      const { error } = await supabase.from('course_progress').insert({
        student_id: session.user.id,
        course_id: courseId,
        lesson_id: lessonId
      });

      if (error && error.code !== '23505') {
        setMsg('تعذر تسجيل مشاهدة الدرس: ' + error.message);
        return;
      }

      setProgressRows(prev => {
        if (prev.some(row => row.lesson_id === lessonId)) {
          return prev;
        }

        return [
          ...prev,
          {
            student_id: session.user.id,
            course_id: courseId,
            lesson_id: lessonId
          }
        ];
      });

      setMsg('تم تسجيل الدرس كمكتمل بنجاح.');
    } catch (error) {
      setMsg('حدث خطأ أثناء تسجيل مشاهدة الدرس: ' + getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function register(event) {
    event.preventDefault();

    if (busy) return;

    if (!phone.trim() || !guardianPhone.trim() || !governorate) {
      setMsg('من فضلك أدخل رقم هاتف الطالب ورقم ولي الأمر واختر المحافظة.');
      return;
    }

    setBusy(true);
    setMsg('');

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: name.trim(),
            grade,
            phone: phone.trim(),
            guardian_phone: guardianPhone.trim(),
            governorate
          }
        }
      });

      if (error) {
        const errorText = [
          error.message || '',
          error.code || '',
          error.details || '',
          error.hint || ''
        ].join(' ').toLowerCase();

        if (
          error.code === '23505' ||
          errorText.includes('profiles_phone_unique') ||
          errorText.includes('duplicate key') ||
          errorText.includes('unique constraint')
        ) {
          setMsg('رقم التليفون ده مستخدم بالفعل في حساب آخر. استخدم رقمًا مختلفًا.');
        } else {
          setMsg('تعذر إنشاء الحساب: ' + error.message);
        }
      } else if (data.session) {
        setMsg('تم إنشاء الحساب وتسجيل الدخول بنجاح.');
      } else {
        setMsg('تم إنشاء الحساب. افحص بريدك الإلكتروني لتأكيد الحساب إذا كان تأكيد البريد مفعّلاً.');
      }
    } catch (error) {
      const errorText = [
        error?.message || '',
        error?.code || '',
        error?.details || '',
        error?.hint || ''
      ].join(' ').toLowerCase();

      if (
        error?.code === '23505' ||
        errorText.includes('profiles_phone_unique') ||
        errorText.includes('duplicate key') ||
        errorText.includes('unique constraint')
      ) {
        setMsg('رقم التليفون ده مستخدم بالفعل في حساب آخر. استخدم رقمًا مختلفًا.');
      } else {
        setMsg('حدث خطأ أثناء إنشاء الحساب: ' + getErrorMessage(error));
      }
    } finally {
      setBusy(false);
    }
  }

  async function login(event) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setMsg('');

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });

      if (error) {
        setMsg('تعذر تسجيل الدخول: ' + error.message);
      } else {
        setMsg('تم تسجيل الدخول بنجاح.');
      }
    } catch (error) {
      setMsg('حدث خطأ أثناء تسجيل الدخول: ' + getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    if (!email.trim()) {
      setMsg('اكتب البريد الإلكتروني أولاً.');
      return;
    }

    setBusy(true);
    setMsg('');

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: window.location.origin }
      );

      setMsg(error
        ? 'تعذر إرسال رابط الاستعادة: ' + error.message
        : 'إذا كان البريد مسجلاً، فستصلك رسالة استعادة كلمة المرور.'
      );
    } catch (error) {
      setMsg('حدث خطأ: ' + getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function browseCourse(course) {
    setViewedCourse(course);
    setTab('course');
    setMsg('');
  }

  function subscribeCourse(course) {
    if (!session) {
      setSelectedCourse(course.id);
      setTab('home');
      setMsg('سجّل الدخول أو أنشئ حسابًا أولاً، وسيتم اختيار الكورس تلقائيًا.');
      return;
    }

    const existingSubscription = mySubs.find(
      s => s.course_id === course.id && s.status !== 'rejected'
    );

    if (existingSubscription?.status === 'approved') {
      browseCourse(course);
      return;
    }

    if (existingSubscription?.status === 'pending') {
      setMsg('طلب اشتراكك في هذا الكورس قيد المراجعة.');
      return;
    }

    setSelectedCourse(course.id);
    setTab('dashboard');
    setMsg('تم اختيار كورس ' + course.title + '. أكمل طلب الاشتراك بالأسفل.');
  }

  async function requestSubscription(event) {
    event.preventDefault();

    if (busy) return;

    if (!session) {
      setMsg('يجب تسجيل الدخول أولاً.');
      setTab('home');
      return;
    }

    if (!selectedCourse) {
      setMsg('اختر الكورس أولاً.');
      return;
    }

    const course = courses.find(c => c.id === selectedCourse);

    if (!course) {
      setMsg('الكورس غير موجود. حدّث الصفحة وحاول مرة أخرى.');
      return;
    }

    const existingSubscription = mySubs.find(
      s => s.course_id === selectedCourse && s.status !== 'rejected'
    );

    if (existingSubscription) {
      setMsg(
        existingSubscription.status === 'approved'
          ? 'اشتراكك في هذا الكورس مفعّل بالفعل.'
          : 'لديك طلب اشتراك قيد المراجعة لهذا الكورس.'
      );
      return;
    }

    const whatsappWindow = window.open('about:blank', '_blank');

    setBusy(true);
    setMsg('جارٍ تسجيل طلب الاشتراك...');

    try {
      const { error } = await supabase.from('subscriptions').insert({
        student_id: session.user.id,
        course_id: selectedCourse,
        receipt_path: null,
        transfer_reference: null,
        status: 'pending'
      });

      if (error) {
        if (whatsappWindow) whatsappWindow.close();

        setMsg(
          error.code === '23505'
            ? 'لديك طلب اشتراك قائم أو اشتراك مفعّل لهذا الكورس.'
            : 'فشل تسجيل الطلب: ' + error.message
        );
        return;
      }

      const studentName =
        profile?.full_name ||
        name ||
        session.user.user_metadata?.full_name ||
        'طالب';

      const studentPhone =
        profile?.phone ||
        phone ||
        session.user.user_metadata?.phone ||
        'غير مسجل';

      const parentPhone =
        profile?.guardian_phone ||
        session.user.user_metadata?.guardian_phone ||
        'غير مسجل';

      const studentGovernorate =
        profile?.governorate ||
        session.user.user_metadata?.governorate ||
        'غير محددة';

      const studentGrade =
        profile?.grade ||
        grade ||
        session.user.user_metadata?.grade ||
        'غير محدد';

      const message = [
        'مرحباً، أريد تأكيد طلب اشتراك في منصة الفيلسوف محمود حسن.',
        'اسم الطالب: ' + studentName,
        'البريد الإلكتروني: ' + (session.user.email || ''),
        'رقم هاتف الطالب: ' + studentPhone,
        'رقم ولي الأمر: ' + parentPhone,
        'المحافظة: ' + studentGovernorate,
        'الصف الدراسي: ' + studentGrade,
        'الكورس: ' + course.title,
        'السعر: ' + course.price + ' جنيه',
        '',
        'سأرسل صورة إثبات التحويل هنا.'
      ].join('\n');

      const whatsappUrl =
        'https://wa.me/' + PAYMENT_WHATSAPP +
        '?text=' + encodeURIComponent(message);

      setSelectedCourse('');
      setMsg('تم تسجيل الطلب. أرسل صورة التحويل في محادثة واتساب لإكمال المراجعة.');

      await loadProfile(session);

      if (whatsappWindow) {
        whatsappWindow.location.href = whatsappUrl;
      } else {
        window.location.href = whatsappUrl;
      }
    } catch (error) {
      if (whatsappWindow) whatsappWindow.close();
      setMsg('حدث خطأ أثناء تسجيل الطلب: ' + getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function review(id, status) {
    if (!isAdmin || busy) return;

    if (!['approved', 'rejected'].includes(status)) {
      setMsg('حالة الطلب غير صحيحة.');
      return;
    }

    setBusy(true);
    setMsg('');

    try {
      const { error } = await supabase.from('subscriptions')
        .update({
          status,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('status', 'pending');

      if (error) {
        setMsg('تعذر تحديث الطلب: ' + error.message);
      } else {
        setMsg(
          status === 'approved'
            ? 'تم قبول الطلب وتفعيل الاشتراك.'
            : 'تم رفض الطلب.'
        );
      }

      await Promise.all([loadPending(), loadCourses()]);
    } catch (error) {
      setMsg('حدث خطأ أثناء مراجعة الطلب: ' + getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function addCourse(event) {
    event.preventDefault();

    if (!isAdmin || busy) return;

    const numericPrice = Number(price);

    if (!courseTitle.trim()) {
      setMsg('اكتب اسم الكورس.');
      return;
    }

    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      setMsg('اكتب سعرًا صحيحًا للكورس.');
      return;
    }

    setBusy(true);
    setMsg('');

    try {
      const { error } = await supabase.from('courses').insert({
        title: courseTitle.trim(),
        grade: courseGrade,
        price: numericPrice,
        active: true
      });

      if (error) {
        setMsg('تعذرت إضافة الكورس: ' + error.message);
      } else {
        setMsg('تمت إضافة الكورس بنجاح.');
        setCourseTitle('');
        setPrice('');
        await loadCourses();
      }
    } catch (error) {
      setMsg('حدث خطأ أثناء إضافة الكورس: ' + getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function addLesson(event) {
    event.preventDefault();

    if (!isAdmin || busy) return;

    const form = event.currentTarget;
    const fd = new FormData(form);
    const title = String(fd.get('title') || '').trim();
    const videoUrl = String(fd.get('url') || '').trim();

    if (!title || !videoUrl) {
      setMsg('اكتب عنوان الدرس ورابط الفيديو.');
      return;
    }

    try {
      const parsedUrl = new URL(videoUrl);

      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        setMsg('رابط الفيديو غير صحيح.');
        return;
      }
    } catch {
      setMsg('رابط الفيديو غير صحيح.');
      return;
    }

    setBusy(true);
    setMsg('');

    try {
      const { error } = await supabase.from('lessons').insert({
        course_id: fd.get('course'),
        title,
        video_url: videoUrl,
        sort_order: Number(fd.get('order') || 0)
      });

      if (error) {
        setMsg('تعذرت إضافة الدرس: ' + error.message);
      } else {
        setMsg('تمت إضافة الدرس بنجاح.');
        form.reset();
      }
    } catch (error) {
      setMsg('حدث خطأ أثناء إضافة الدرس: ' + getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function openSupport() {
    const message = 'مرحباً، أحتاج إلى مساعدة فنية في منصة الفيلسوف محمود حسن.';
    const url =
      'https://wa.me/' + SUPPORT_WHATSAPP +
      '?text=' + encodeURIComponent(message);

    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function copyPaymentNumber() {
    try {
      if (!navigator.clipboard?.writeText) {
        setMsg('رقم فودافون كاش هو: ' + VODAFONE_CASH_NUMBER);
        return;
      }

      await navigator.clipboard.writeText(VODAFONE_CASH_NUMBER);
      setMsg('تم نسخ رقم فودافون كاش.');
    } catch {
      setMsg('رقم فودافون كاش هو: ' + VODAFONE_CASH_NUMBER);
    }
  }

  async function logout() {
    setBusy(true);

    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        setMsg('تعذر تسجيل الخروج: ' + error.message);
      } else {
        setTab('home');
        setMsg('تم تسجيل الخروج.');
      }
    } catch (error) {
      setMsg('حدث خطأ أثناء تسجيل الخروج: ' + getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const approvedCourseIds = mySubs
    .filter(s => s.status === 'approved')
    .map(s => s.course_id);

  if (!configured) {
    return (
      <main className="setup">
        <div className="panel">
          <h1>منصة الفيلسوف محمود حسن</h1>
          <h2>إعداد الاتصال بقاعدة البيانات</h2>
          <p>
            أضف رابط مشروع Supabase ومفتاح anon/public
            في متغيرات البيئة ثم أعد تشغيل المشروع.
          </p>
          <p>لا تضع مفتاح Service Role في الواجهة.</p>
        </div>
      </main>
    );
  }

  return (
    <div className="app">
      <header>
        <div>
          <span className="mark">ف</span>
          <div>
            <b>منصة الفيلسوف محمود حسن</b>
            <small>الفلسفة والمنطق • المنهج المصري</small>
          </div>
        </div>

        <button
          type="button"
          className="menu-toggle"
          onClick={() => setMenuOpen(true)}
          aria-label="فتح القائمة"
          aria-expanded={menuOpen}
        >
          ☰
        </button>
      </header>

      {menuOpen && (
        <div
          className="menu-overlay"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <aside
        className={`side-menu ${menuOpen ? 'open' : ''}`}
        aria-hidden={!menuOpen}
      >
        <div className="side-menu-header">
          <b>القائمة الرئيسية</b>
          <button
            type="button"
            className="menu-close"
            onClick={() => setMenuOpen(false)}
            aria-label="إغلاق القائمة"
          >
            ×
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            setTab('home');
            setMenuOpen(false);
          }}
        >
          الرئيسية
        </button>

        {session && (
          <button
            type="button"
            onClick={() => {
              setTab('dashboard');
              setMenuOpen(false);
            }}
          >
            حسابي
          </button>
        )}

        {isAdmin && (
          <button
            type="button"
            onClick={() => {
              setTab('admin');
              setMenuOpen(false);
            }}
          >
            الإدارة
          </button>
        )}

        <button
          type="button"
          className="outline"
          onClick={() => {
            setMenuOpen(false);
            openSupport();
          }}
        >
          الدعم الفني
        </button>

        {session && (
          <button
            type="button"
            className="outline"
            disabled={busy}
            onClick={() => {
              setMenuOpen(false);
              logout();
            }}
          >
            خروج
          </button>
        )}
      </aside>

      {tab === 'home' && (
        <section className="hero">
          <img
            src={TEACHER_IMAGE}
            alt="صورة المدرّس"
            onError={e => {
              e.currentTarget.style.display = 'none';
            }}
            style={{
              width: '180px',
              height: '180px',
              objectFit: 'cover',
              borderRadius: '50%',
              border: '4px solid #d4af37',
              display: 'block',
              margin: '0 auto 20px'
            }}
          />

          <p className="eyebrow">تعلم • تدرب • تفوق</p>
          <h1>فهم الفلسفة يبدأ من هنا</h1>
          <p>محاضرات منظمة واختبارات ومتابعة لمستواك الدراسي.</p>
        </section>
      )}

      {msg && (
        <div className="notice" role="status">
          {msg}
        </div>
      )}

      {tab === 'home' && (
        <>
          {!session ? (
            <section className="auth grid2">
              <form className="panel" onSubmit={login}>
                <h2>تسجيل الدخول</h2>

                <label>
                  البريد الإلكتروني
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                  />
                </label>

                <label>
                  كلمة المرور
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                </label>

                <button disabled={busy}>
                  {busy ? 'جارٍ الدخول...' : 'دخول'}
                </button>

                <button
                  type="button"
                  className="link"
                  disabled={busy}
                  onClick={resetPassword}
                >
                  نسيت كلمة المرور؟
                </button>
              </form>

              <form className="panel" onSubmit={register}>
                <h2>إنشاء حساب طالب</h2>

                <label>
                  الاسم بالكامل
                  <input
                    required
                    autoComplete="name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                  />
                </label>

                <label>
                  البريد الإلكتروني
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                  />
                </label>

                <label>
                  رقم هاتف الطالب
                  <input
                    type="tel"
                    required
                    autoComplete="tel"
                    placeholder="مثال: 01012345678"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                  />
                </label>

                <label>
                  رقم هاتف ولي الأمر
                  <input
                    type="tel"
                    required
                    placeholder="رقم هاتف ولي الأمر"
                    value={guardianPhone}
                    onChange={e => setGuardianPhone(e.target.value)}
                  />
                </label>

                <label>
                  المحافظة
                  <select
                    required
                    value={governorate}
                    onChange={e => setGovernorate(e.target.value)}
                  >
                    <option value="">اختر المحافظة...</option>
                    {governorates.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </label>

                <label>
                  الصف الدراسي
                  <select
                    required
                    value={grade}
                    onChange={e => setGrade(e.target.value)}
                  >
                    {grades.map(g => <option key={g}>{g}</option>)}
                  </select>
                </label>

                <label>
                  كلمة المرور (6 أحرف على الأقل)
                  <input
                    type="password"
                    minLength="6"
                    required
                    autoComplete="new-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                </label>

                <button disabled={busy}>
                  {busy ? 'جارٍ إنشاء الحساب...' : 'إنشاء الحساب'}
                </button>
              </form>
            </section>
          ) : (
            <section className="content">
              <h2>أهلاً بك في المنصة</h2>
              <p>اختر الكورس الذي تريد تصفحه أو الاشتراك فيه.</p>
            </section>
          )}

          <section className="content">
            <h2>الكورسات المتاحة</h2>

            <div className="grid3">
              {courses.map(c => (
                <article className="panel course" key={c.id}>
                  {getCourseImage(c) && (
                    <img
                      src={getCourseImage(c)}
                      alt={`غلاف كورس ${c.title}`}
                      onError={e => {
                        e.currentTarget.style.display = 'none';
                      }}
                      style={{
                        width: '100%',
                        height: '180px',
                        objectFit: 'cover',
                        borderRadius: '12px',
                        marginBottom: '12px'
                      }}
                    />
                  )}

                  <span className="tag">{c.grade}</span>
                  <h3>{c.title}</h3>
                  <b>{c.price} جنيه</b>

                  <div className="actions">
                    <button onClick={() => browseCourse(c)}>
                      تصفح الكورس
                    </button>

                    {session && mySubs.some(
                      s => s.course_id === c.id && s.status === 'approved'
                    ) ? (
                      <p style={{
                        color: '#16803c',
                        fontWeight: 'bold',
                        textAlign: 'center'
                      }}>
                        أنت مشترك في هذا الكورس ✓
                      </p>
                    ) : session && mySubs.some(
                      s => s.course_id === c.id && s.status === 'pending'
                    ) ? (
                      <p style={{
                        color: '#a87916',
                        fontWeight: 'bold',
                        textAlign: 'center'
                      }}>
                        طلبك قيد المراجعة
                      </p>
                    ) : (
                      <button
                        className="outline"
                        onClick={() => subscribeCourse(c)}
                      >
                        اشتراك في الكورس
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>

            {courses.length === 0 && (
              <p>لا توجد كورسات متاحة حالياً.</p>
            )}
          </section>
        </>
      )}

      {tab === 'course' && viewedCourse && (
        <section className="content">
          <button className="outline" onClick={() => setTab('home')}>
            العودة للكورسات
          </button>

          <article className="panel">
            {getCourseImage(viewedCourse) && (
              <img
                src={getCourseImage(viewedCourse)}
                alt={`غلاف كورس ${viewedCourse.title}`}
                onError={e => {
                  e.currentTarget.style.display = 'none';
                }}
                style={{
                  width: '100%',
                  maxHeight: '260px',
                  objectFit: 'cover',
                  borderRadius: '12px',
                  marginBottom: '12px'
                }}
              />
            )}

            <span className="tag">{viewedCourse.grade}</span>
            <h2>{viewedCourse.title}</h2>
            <h3>{viewedCourse.price} جنيه</h3>

            {session && approvedCourseIds.includes(viewedCourse.id) ? (
              <>
                <p>اشتراكك في هذا الكورس مفعّل. يمكنك مشاهدة الدروس.</p>
                <Course
                  course={viewedCourse}
                  progressRows={progressRows}
                  onMarkViewed={markLessonViewed}
                  busy={busy}
                />
              </>
            ) : (
              <>
                <p>
                  محتوى الكورس متاح بعد الاشتراك ومراجعة الدفع وتفعيل
                  الاشتراك من الإدارة.
                </p>
                <button onClick={() => subscribeCourse(viewedCourse)}>
                  اشتراك في الكورس
                </button>
              </>
            )}
          </article>
        </section>
      )}

      {tab === 'dashboard' && session && (
        <section className="content">
          <h2>حسابي</h2>

          <article className="panel">
            <h3>بياناتي الشخصية</h3>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '12px',
              marginTop: '16px'
            }}>
              <div style={{
                background: 'linear-gradient(135deg, #fffaf0, #f4ead0)',
                border: '1px solid #e6d5a8',
                borderRadius: '14px',
                padding: '15px',
                display: 'flex',
                flexDirection: 'column',
                gap: '7px',
                minWidth: 0
              }}>
                <span style={{ color: '#947326', fontSize: '13px', fontWeight: 'bold' }}>
                  الاسم بالكامل
                </span>
                <strong style={{ color: '#26334a', fontSize: '15px', overflowWrap: 'anywhere' }}>
                  {profile?.full_name || session.user.user_metadata?.full_name || 'غير مسجل'}
                </strong>
              </div>

              <div style={{
                background: 'linear-gradient(135deg, #f0f7ff, #e2edfa)',
                border: '1px solid #c9dced',
                borderRadius: '14px',
                padding: '15px',
                display: 'flex',
                flexDirection: 'column',
                gap: '7px',
                minWidth: 0
              }}>
                <span style={{ color: '#39719c', fontSize: '13px', fontWeight: 'bold' }}>
                  البريد الإلكتروني
                </span>
                <strong dir="ltr" style={{ color: '#26334a', fontSize: '15px', overflowWrap: 'anywhere' }}>
                  {profile?.email || session.user.email || 'غير مسجل'}
                </strong>
              </div>

              <div style={{
                background: 'linear-gradient(135deg, #effaf3, #e0f3e7)',
                border: '1px solid #c6e5d0',
                borderRadius: '14px',
                padding: '15px',
                display: 'flex',
                flexDirection: 'column',
                gap: '7px',
                minWidth: 0
              }}>
                <span style={{ color: '#398052', fontSize: '13px', fontWeight: 'bold' }}>
                  رقم هاتف الطالب
                </span>
                <strong dir="ltr" style={{ color: '#26334a', fontSize: '15px', overflowWrap: 'anywhere' }}>
                  {profile?.phone || session.user.user_metadata?.phone || 'غير مسجل'}
                </strong>
              </div>

              <div style={{
                background: 'linear-gradient(135deg, #fff3f0, #fce5df)',
                border: '1px solid #edcfc6',
                borderRadius: '14px',
                padding: '15px',
                display: 'flex',
                flexDirection: 'column',
                gap: '7px',
                minWidth: 0
              }}>
                <span style={{ color: '#a65e4b', fontSize: '13px', fontWeight: 'bold' }}>
                  رقم ولي الأمر
                </span>
                <strong dir="ltr" style={{ color: '#26334a', fontSize: '15px', overflowWrap: 'anywhere' }}>
                  {profile?.guardian_phone || session.user.user_metadata?.guardian_phone || 'غير مسجل'}
                </strong>
              </div>

              <div style={{
                background: 'linear-gradient(135deg, #f5f0ff, #eae2fa)',
                border: '1px solid #d8cbed',
                borderRadius: '14px',
                padding: '15px',
                display: 'flex',
                flexDirection: 'column',
                gap: '7px',
                minWidth: 0
              }}>
                <span style={{ color: '#7855a5', fontSize: '13px', fontWeight: 'bold' }}>
                  المحافظة
                </span>
                <strong style={{ color: '#26334a', fontSize: '15px', overflowWrap: 'anywhere' }}>
                  {profile?.governorate || session.user.user_metadata?.governorate || 'غير مسجلة'}
                </strong>
              </div>

              <div style={{
                background: 'linear-gradient(135deg, #eef8fa, #dff0f2)',
                border: '1px solid #c6e1e5',
                borderRadius: '14px',
                padding: '15px',
                display: 'flex',
                flexDirection: 'column',
                gap: '7px',
                minWidth: 0
              }}>
                <span style={{ color: '#397b85', fontSize: '13px', fontWeight: 'bold' }}>
                  الصف الدراسي
                </span>
                <strong style={{ color: '#26334a', fontSize: '15px', overflowWrap: 'anywhere' }}>
                  {profile?.grade || session.user.user_metadata?.grade || 'غير مسجل'}
                </strong>
              </div>
            </div>
          </article>

          <h3>اشتراكاتي</h3>

          {mySubs.length === 0 && (
            <p>ليس لديك اشتراكات حتى الآن.</p>
          )}

          {mySubs.map(s => (
            <article className="panel item" key={s.id}>
              <b>{s.courses?.title || 'كورس'}</b>
              <span>{s.courses?.grade}</span>
              <span>
                الحالة: {
                  s.status === 'approved'
                    ? 'مفعّل'
                    : s.status === 'pending'
                      ? 'قيد المراجعة'
                      : 'مرفوض'
                }
              </span>
            </article>
          ))}

          <h3>طلب اشتراك جديد</h3>

          <form className="panel" onSubmit={requestSubscription}>
            <label>
              اختر الكورس
              <select
                value={selectedCourse}
                onChange={e => setSelectedCourse(e.target.value)}
                required
              >
                <option value="">اختر الكورس...</option>

                {courses
                  .filter(c => !mySubs.some(
                    s => s.course_id === c.id && s.status !== 'rejected'
                  ))
                  .map(c => (
                    <option key={c.id} value={c.id}>
                      {c.title} — {c.price} جنيه
                    </option>
                  ))}
              </select>
            </label>

            <div className="panel">
              <h3>الدفع عن طريق فودافون كاش</h3>
              <p>حوّل قيمة الكورس إلى رقم فودافون كاش التالي:</p>
              <h2 dir="ltr">{VODAFONE_CASH_NUMBER}</h2>

              <button
                type="button"
                className="outline"
                onClick={copyPaymentNumber}
              >
                نسخ رقم فودافون كاش
              </button>

              <p>
                بعد التحويل اضغط على زر إرسال الطلب، وسيتم فتح واتساب
                لإرسال إثبات التحويل. لن يتم تفعيل الكورس إلا بعد مراجعة
                التحويل والتأكد من وصول المبلغ.
              </p>
            </div>

            <button disabled={busy || !selectedCourse}>
              {busy
                ? 'جارٍ إرسال الطلب...'
                : 'تسجيل الطلب وإرسال إثبات التحويل على واتساب'}
            </button>
          </form>

          <h3>الكورسات المفعّلة</h3>

          {courses
            .filter(c => approvedCourseIds.includes(c.id))
            .map(c => (
              <div key={c.id}>
                <Course
                  course={c}
                  progressRows={progressRows}
                  onMarkViewed={markLessonViewed}
                  busy={busy}
                />
              </div>
            ))}
        </section>
      )}

      {tab === 'admin' && isAdmin && (
        <section className="content">
          <h2>لوحة تحكم المدير</h2>

          <div className="grid2">
            <form className="panel" onSubmit={addCourse}>
              <h3>إضافة كورس</h3>

              <label>
                اسم الكورس
                <input
                  required
                  value={courseTitle}
                  onChange={e => setCourseTitle(e.target.value)}
                />
              </label>

              <label>
                الصف
                <select
                  value={courseGrade}
                  onChange={e => setCourseGrade(e.target.value)}
                >
                  {grades.map(g => <option key={g}>{g}</option>)}
                </select>
              </label>

              <label>
                السعر بالجنيه
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                />
              </label>

              <button disabled={busy}>
                {busy ? 'جارٍ الحفظ...' : 'إضافة الكورس'}
              </button>
            </form>

            <form className="panel" onSubmit={addLesson}>
              <h3>إضافة درس</h3>

              <label>
                الكورس
                <select name="course" required defaultValue="">
                  <option value="" disabled>اختر الكورس...</option>
                  {courses.map(c => (
                    <option value={c.id} key={c.id}>{c.title}</option>
                  ))}
                </select>
              </label>

              <label>
                عنوان الدرس
                <input name="title" required />
              </label>

              <label>
                رابط الفيديو
                <input name="url" type="url" required placeholder="رابط الفيديو" />
              </label>

              <label>
                ترتيب الدرس
                <input name="order" type="number" defaultValue="0" />
              </label>

              <button disabled={busy || courses.length === 0}>
                {busy ? 'جارٍ الحفظ...' : 'حفظ الدرس'}
              </button>
            </form>
          </div>

          <div className="section-heading">
            <h3>طلبات الاشتراك المعلقة ({pending.length})</h3>
            <button
              type="button"
              className="outline"
              disabled={busy}
              onClick={loadPending}
            >
              تحديث
            </button>
          </div>

          {pending.length === 0 && (
            <p>لا توجد طلبات معلقة حالياً.</p>
          )}

          {pending.map(s => (
            <article className="panel item" key={s.id}>
              <b>{s.profiles?.full_name || s.profiles?.email || 'طالب'}</b>
              <span>{s.courses?.title} — {s.courses?.grade}</span>
              <span>المبلغ: {s.courses?.price ?? 'غير محدد'} جنيه</span>
              <span>هاتف الطالب: {s.profiles?.phone || 'غير مسجل'}</span>
              <span>هاتف ولي الأمر: {s.profiles?.guardian_phone || 'غير مسجل'}</span>
              <span>المحافظة: {s.profiles?.governorate || 'غير محددة'}</span>
              <span>البريد: {s.profiles?.email || 'غير متاح'}</span>

              <p>
                تأكد من وصول التحويل فعلياً قبل الضغط على قبول وتفعيل.
              </p>

              <div className="actions">
                <button
                  disabled={busy}
                  onClick={() => review(s.id, 'approved')}
                >
                  قبول وتفعيل
                </button>

                <button
                  disabled={busy}
                  className="danger"
                  onClick={() => review(s.id, 'rejected')}
                >
                  رفض
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      <footer>
        <p>© منصة الفيلسوف محمود حسن — جميع الحقوق محفوظة</p>
        <button className="outline" onClick={openSupport}>
          الدعم الفني عبر واتساب: 01061818085
        </button>
      </footer>
    </div>
  );
}

function Course({ course, progressRows = [], onMarkViewed, busy }) {
  const [lessons, setLessons] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadLessons() {
      setLoading(true);
      setError('');

      try {
        const { data, error: queryError } = await supabase.from('lessons')
          .select('id,title,video_url,sort_order')
          .eq('course_id', course.id)
          .order('sort_order');

        if (!active) return;

        if (queryError) {
          setError(queryError.message);
          setLessons([]);
        } else {
          setLessons(data || []);
        }
      } catch (error) {
        if (active) setError(getErrorMessage(error));
      } finally {
        if (active) setLoading(false);
      }
    }

    loadLessons();

    return () => {
      active = false;
    };
  }, [course.id]);

  const completedIds = new Set(
    progressRows
      .filter(p => p.course_id === course.id)
      .map(p => p.lesson_id)
  );

  const completedCount = lessons.filter(
    lesson => completedIds.has(lesson.id)
  ).length;

  const percent = lessons.length
    ? Math.round((completedCount / lessons.length) * 100)
    : 0;

  return (
    <article className="panel">
      <h3>{course.title}</h3>

      {!loading && !error && lessons.length > 0 && (
        <div style={{
          margin: '15px 0',
          padding: '15px',
          background: '#f8f8f8',
          borderRadius: '12px'
        }}>
          <b>تقدمك في الكورس: {percent}%</b>

          <p>
            {completedCount} من {lessons.length} دروس مكتملة
          </p>

          <div style={{
            height: '10px',
            background: '#e5e5e5',
            borderRadius: '20px',
            overflow: 'hidden'
          }}>
            <div style={{
              height: '100%',
              width: `${percent}%`,
              background: '#d4af37',
              borderRadius: '20px',
              transition: 'width 0.3s'
            }} />
          </div>
        </div>
      )}

      {loading && <p>جارٍ تحميل الدروس...</p>}
      {error && <p>تعذر تحميل الدروس: {error}</p>}

      {!loading && !error && lessons.length === 0 && (
        <p>لا توجد دروس مضافة لهذا الكورس بعد.</p>
      )}

      {lessons.map(lesson => {
        const completed = completedIds.has(lesson.id);

        return (
          <div
            key={lesson.id}
            className="item"
            style={{
              padding: '12px',
              marginBottom: '12px',
              borderBottom: '1px solid #eee'
            }}
          >
            <p>▶ {lesson.title}</p>

            <a
              href={lesson.video_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              مشاهدة الدرس
            </a>

            <div style={{ marginTop: '10px' }}>
              {completed ? (
                <button
                  type="button"
                  className="outline"
                  disabled
                >
                  تمت المشاهدة ✓
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onMarkViewed(course.id, lesson.id)}
                >
                  تمت المشاهدة
                </button>
              )}
            </div>
          </div>
        );
      })}
    </article>
  );
}
