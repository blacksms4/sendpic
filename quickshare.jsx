import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { Send, Image as ImageIcon, Copy, Trash2, Clock, CheckCircle, Download, X } from 'lucide-react';

// Firebase 설정
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'photo-share-app';

const App = () => {
  const [user, setUser] = useState(null);
  const [mode, setMode] = useState('send'); // 'send' | 'receive'
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [shareKey, setShareKey] = useState('');
  const [receivedData, setReceivedData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const fileInputRef = useRef(null);

  // 1. 인증 초기화
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("인증 오류:", error);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. 파일 선택 처리
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      if (selectedFile.size > 5 * 1024 * 1024) {
        alert("파일 크기는 5MB 이하여야 합니다.");
        return;
      }
      setFile(selectedFile);
      setPreviewUrl(URL.createObjectURL(selectedFile));
    }
  };

  // 3. 사진 전송 (업로드)
  const handleUpload = async () => {
    if (!user || !file) return;
    setLoading(true);
    setStatusMsg("이미지 업로드 중...");

    const newKey = Math.floor(100000 + Math.random() * 900000).toString();
    const storageRef = ref(storage, `artifacts/${appId}/public/files/${newKey}_${file.name}`);

    try {
      // 1) Storage에 파일 업로드
      const uploadResult = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(uploadResult.ref);

      // 2) Firestore에 정보 저장
      const shareDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'shares', newKey);
      await setDoc(shareDocRef, {
        type: 'image',
        fileName: file.name,
        fileUrl: downloadURL,
        storagePath: uploadResult.ref.fullPath,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 20 * 60000).toISOString(), // 20분 유효
      });

      setShareKey(newKey);
      setStatusMsg("전송 성공! PC에서 아래 키를 입력하세요.");
    } catch (error) {
      console.error("업로드 오류:", error);
      setStatusMsg("업로드 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // 4. 사진 받기
  const handleReceive = async (e) => {
    const key = e.target.value;
    setShareKey(key);

    if (key.length === 6) {
      setLoading(true);
      try {
        const shareDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'shares', key);
        const docSnap = await getDoc(shareDocRef);

        if (docSnap.exists()) {
          setReceivedData(docSnap.data());
          setStatusMsg("이미지를 성공적으로 가져왔습니다!");
        } else {
          setReceivedData(null);
          setStatusMsg("만료되었거나 잘못된 키입니다.");
        }
      } catch (error) {
        setStatusMsg("조회 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    } else {
      setReceivedData(null);
    }
  };

  // 5. 완료 후 데이터 삭제
  const handleClear = async () => {
    if (!receivedData) return;
    try {
      // Storage 파일 삭제
      const storageRef = ref(storage, receivedData.storagePath);
      await deleteObject(storageRef).catch(() => {});
      
      // Firestore 문서 삭제
      const shareDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'shares', shareKey);
      await deleteDoc(shareDocRef);

      setReceivedData(null);
      setShareKey('');
      setStatusMsg("보안을 위해 서버에서 삭제되었습니다.");
    } catch (error) {
      console.error("삭제 오류:", error);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-4 font-sans text-zinc-900">
      <div className="w-full max-w-md bg-white rounded-[2rem] shadow-2xl overflow-hidden border border-zinc-100">
        {/* 상단 헤더 */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-8 text-white">
          <div className="flex justify-between items-center mb-2">
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <ImageIcon size={28} /> IntraPass
            </h1>
            <span className="text-[10px] bg-white/20 px-2 py-1 rounded-full uppercase tracking-widest font-bold">Secure Transfer</span>
          </div>
          <p className="text-blue-100 text-sm opacity-80 font-medium">모바일 사진을 인트라넷 PC로 안전하게</p>
        </div>

        {/* 탭 전환 */}
        <div className="flex p-2 bg-zinc-100 m-4 rounded-2xl">
          <button 
            onClick={() => { setMode('send'); setStatusMsg(''); setShareKey(''); setReceivedData(null); }}
            className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${mode === 'send' ? 'bg-white shadow-sm text-blue-600' : 'text-zinc-500'}`}
          >
            사진 보내기 (모바일)
          </button>
          <button 
            onClick={() => { setMode('receive'); setStatusMsg(''); setShareKey(''); setReceivedData(null); }}
            className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${mode === 'receive' ? 'bg-white shadow-sm text-blue-600' : 'text-zinc-500'}`}
          >
            사진 받기 (PC)
          </button>
        </div>

        <div className="px-8 pb-8">
          {mode === 'send' ? (
            <div className="space-y-6">
              {!previewUrl ? (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-square w-full border-2 border-dashed border-zinc-200 rounded-3xl flex flex-col items-center justify-center gap-4 cursor-pointer hover:bg-zinc-50 hover:border-blue-300 transition-all group"
                >
                  <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
                    <ImageIcon size={32} />
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-zinc-700">사진 선택하기</p>
                    <p className="text-xs text-zinc-400 mt-1">최대 5MB, 이미지 파일</p>
                  </div>
                </div>
              ) : (
                <div className="relative aspect-square w-full rounded-3xl overflow-hidden border border-zinc-100 shadow-inner">
                  <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                  <button 
                    onClick={() => { setFile(null); setPreviewUrl(null); setShareKey(''); }}
                    className="absolute top-4 right-4 bg-black/50 text-white p-2 rounded-full backdrop-blur-md hover:bg-black/70 transition-all"
                  >
                    <X size={20} />
                  </button>
                </div>
              )}

              <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />

              {!shareKey ? (
                <button
                  onClick={handleUpload}
                  disabled={loading || !file}
                  className="w-full py-5 bg-blue-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 disabled:opacity-50 shadow-lg shadow-blue-200 transition-all active:scale-95"
                >
                  {loading ? "전송 중..." : <><Send size={20} /> 보안 키 생성하기</>}
                </button>
              ) : (
                <div className="bg-blue-600 p-6 rounded-3xl text-white text-center space-y-3 animate-in zoom-in duration-300">
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em] opacity-80">Share Code</p>
                  <div className="text-5xl font-black tracking-tighter">{shareKey}</div>
                  <p className="text-xs opacity-70">PC에서 이 번호를 입력하고 사진을 받으세요</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="text-center space-y-4">
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">6자리 보안 키 입력</p>
                <input
                  type="text"
                  maxLength={6}
                  value={shareKey}
                  onChange={handleReceive}
                  placeholder="000000"
                  className="w-full text-center text-5xl font-black tracking-[0.2em] p-6 bg-zinc-100 border-none rounded-3xl focus:ring-4 focus:ring-blue-100 outline-none transition-all placeholder:text-zinc-200 text-blue-600"
                />
              </div>

              {receivedData && (
                <div className="bg-zinc-50 rounded-3xl p-6 space-y-6 border border-zinc-100 animate-in fade-in slide-in-from-bottom-4">
                  <div className="aspect-video w-full rounded-2xl overflow-hidden shadow-md">
                    <img src={receivedData.fileUrl} alt="Received" className="w-full h-full object-cover" />
                  </div>
                  
                  <div className="space-y-3">
                    <a 
                      href={receivedData.fileUrl} 
                      download={receivedData.fileName}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-4 bg-zinc-900 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-black transition-all"
                    >
                      <Download size={18} /> 이미지 저장하기
                    </a>
                    <button 
                      onClick={handleClear}
                      className="w-full py-4 bg-white border border-zinc-200 text-zinc-500 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-red-50 hover:text-red-500 hover:border-red-100 transition-all"
                    >
                      <CheckCircle size={18} /> 확인 및 서버에서 삭제
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          
          {statusMsg && (
            <div className="mt-6 flex items-center justify-center gap-2 text-sm font-semibold text-blue-600 animate-in fade-in">
              <Clock size={14} /> {statusMsg}
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 text-center space-y-1">
        <p className="text-zinc-400 text-[11px] font-medium uppercase tracking-tighter">Secure Intranet File Bridge</p>
        <p className="text-zinc-300 text-[10px]">전송된 사진은 20분 후 또는 확인 즉시 파기됩니다.</p>
      </div>
    </div>
  );
};

export default App;