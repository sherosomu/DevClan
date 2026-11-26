import { motion } from 'framer-motion';

const shimmer = {
  animate: {
    backgroundPosition: ['200% 0', '-200% 0'],
  },
  transition: { duration: 1.6, repeat: Infinity, ease: 'linear' },
};

function ShimmerBlock({ className }) {
  return (
    <motion.div
      {...shimmer}
      className={`rounded-md bg-[linear-gradient(90deg,#1e293b_25%,#334155_37%,#1e293b_63%)] bg-[length:400%_100%] ${className}`}
    />
  );
}

export default function PostCardSkeleton() {
  return (
    <div className="rounded-lg border border-clan-border bg-clan-surface p-4">
      <div className="flex gap-3">
        <div className="flex flex-col items-center gap-2 pt-1">
          <ShimmerBlock className="h-5 w-5" />
          <ShimmerBlock className="h-3 w-4" />
          <ShimmerBlock className="h-5 w-5" />
        </div>
        <div className="flex-1 space-y-2">
          <ShimmerBlock className="h-3 w-32" />
          <ShimmerBlock className="h-4 w-3/4" />
          <ShimmerBlock className="h-3 w-full" />
          <ShimmerBlock className="h-3 w-5/6" />
          <ShimmerBlock className="h-24 w-full" />
        </div>
      </div>
    </div>
  );
}

/** Renders N skeleton cards — drop this in while a feed page is loading. */
export function FeedSkeletonList({ count = 4 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <PostCardSkeleton key={i} />
      ))}
    </div>
  );
}
