/** Soft floating gradient blobs behind the glass cards. Pure CSS (GPU transforms only); frozen under reduced motion. */
export function AmbientBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="animate-float-a absolute -left-32 -top-24 h-[28rem] w-[28rem] rounded-full bg-sky-300/50 blur-3xl will-change-transform" />
      <div className="animate-float-b absolute -right-24 top-10 h-[26rem] w-[26rem] rounded-full bg-amber-200/60 blur-3xl will-change-transform" />
      <div className="animate-float-c absolute left-1/3 top-1/2 h-[30rem] w-[30rem] rounded-full bg-fuchsia-300/40 blur-3xl will-change-transform" />
      <div className="animate-float-a absolute -bottom-40 right-1/4 h-[24rem] w-[24rem] rounded-full bg-violet-300/40 blur-3xl will-change-transform" />
    </div>
  );
}
