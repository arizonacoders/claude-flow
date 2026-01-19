import { useState, useMemo } from 'react';
import type { Comment, PersonaType } from '../types';
import * as api from '../api/client';

interface CommentThreadProps {
  issueId: string;
  comments: Comment[];
  onCommentAdded: () => void;
}

const personaIcons: Record<PersonaType, string> = {
  'orchestrator': '🎭',
  'review-draft': '\uD83D\uDCDD',
  'architect': '\uD83C\uDFDB\uFE0F',
  'qa-review': '\uD83E\uDDEA',
  'triage': '\uD83D\uDCCB',
  'system': '⚙️',
  'user': '\uD83D\uDC64',
};

const personaLabels: Record<PersonaType, string> = {
  'orchestrator': 'Orchestrator',
  'review-draft': 'Alex (TPO)',
  'architect': 'Sam (Dev Lead)',
  'qa-review': 'Blake (QA)',
  'triage': 'Nik (PM)',
  'system': 'System',
  'user': 'User',
};

// Maximum nesting depth (matches backend)
const MAX_DEPTH = 2;

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Build a tree structure from flat comment array
function buildCommentTree(comments: Comment[]): Comment[] {
  const commentMap = new Map<string, Comment>();
  const roots: Comment[] = [];

  // First pass: create map and initialize replies array
  for (const comment of comments) {
    commentMap.set(comment.id, { ...comment, replies: [], depth: 0 });
  }

  // Second pass: build tree and calculate depths
  for (const comment of comments) {
    const treeComment = commentMap.get(comment.id)!;
    if (comment.parentCommentId) {
      const parent = commentMap.get(comment.parentCommentId);
      if (parent) {
        parent.replies = parent.replies || [];
        treeComment.depth = (parent.depth || 0) + 1;
        parent.replies.push(treeComment);
      } else {
        // Orphaned comment (parent was deleted) - show as root with note
        treeComment.metadata = { ...treeComment.metadata, orphaned: true };
        roots.push(treeComment);
      }
    } else {
      roots.push(treeComment);
    }
  }

  return roots;
}

interface CommentItemProps {
  comment: Comment;
  depth: number;
  onReply: (commentId: string, persona: string) => void;
}

function CommentItem({ comment, depth, onReply }: CommentItemProps) {
  const isOrphaned = Boolean(comment.metadata?.orphaned);
  const canReply = depth < MAX_DEPTH;

  return (
    <div
      className={`comment ${depth > 0 ? 'comment-reply' : ''}`}
      style={{ marginLeft: depth * 20 }}
    >
      {depth > 0 && <div className="comment-thread-line" />}
      <div className="comment-header">
        <span className="comment-persona">
          {personaIcons[comment.persona]} {personaLabels[comment.persona]}
        </span>
        <span className="comment-date">{formatDate(comment.createdAt)}</span>
        {isOrphaned && <span className="comment-orphaned">(reply to deleted)</span>}
        <span className="comment-id" title={comment.id}>{comment.id.slice(0, 8)}</span>
        {canReply && (
          <button
            className="reply-btn"
            onClick={() => onReply(comment.id, personaLabels[comment.persona])}
          >
            Reply
          </button>
        )}
      </div>
      <div className="comment-content">{comment.content}</div>

      {/* Render replies recursively */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="comment-replies">
          {comment.replies.map(reply => (
            <CommentItem
              key={reply.id}
              comment={reply}
              depth={depth + 1}
              onReply={onReply}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function CommentThread({ issueId, comments, onCommentAdded }: CommentThreadProps) {
  const [newComment, setNewComment] = useState('');
  const [persona, setPersona] = useState<PersonaType>('user');
  const [replyingTo, setReplyingTo] = useState<{ id: string; label: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Build comment tree
  const commentTree = useMemo(() => buildCommentTree(comments), [comments]);

  const handleReply = (commentId: string, personaLabel: string) => {
    setReplyingTo({ id: commentId, label: personaLabel });
    // Focus the textarea
    const textarea = document.querySelector('.comment-form textarea') as HTMLTextAreaElement;
    if (textarea) {
      textarea.focus();
    }
  };

  const cancelReply = () => {
    setReplyingTo(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    setSubmitting(true);
    try {
      await api.addComment(issueId, {
        persona,
        content: newComment,
        parentCommentId: replyingTo?.id
      });
      setNewComment('');
      setReplyingTo(null);
      onCommentAdded();
    } catch (err) {
      console.error('Failed to add comment:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="comment-thread">
      <h3>Comments ({comments.length})</h3>

      <div className="comments-list">
        {commentTree.map(comment => (
          <CommentItem
            key={comment.id}
            comment={comment}
            depth={0}
            onReply={handleReply}
          />
        ))}
        {comments.length === 0 && (
          <div className="no-comments">No comments yet</div>
        )}
      </div>

      <form className="comment-form" onSubmit={handleSubmit}>
        {replyingTo && (
          <div className="replying-to">
            <span>↳ Replying to {replyingTo.label}</span>
            <button type="button" onClick={cancelReply} className="cancel-reply-btn">
              ✕
            </button>
          </div>
        )}
        <select
          value={persona}
          onChange={e => setPersona(e.target.value as PersonaType)}
          disabled={submitting}
        >
          <option value="user">User</option>
          <option value="triage">Nik (PM)</option>
          <option value="review-draft">Alex (TPO)</option>
          <option value="architect">Sam (Dev Lead)</option>
          <option value="qa-review">Blake (QA)</option>
        </select>
        <textarea
          value={newComment}
          onChange={e => setNewComment(e.target.value)}
          placeholder={replyingTo ? `Reply to ${replyingTo.label}...` : 'Add a comment...'}
          disabled={submitting}
          rows={3}
        />
        <button type="submit" disabled={submitting || !newComment.trim()}>
          {submitting ? 'Posting...' : replyingTo ? 'Post Reply' : 'Post Comment'}
        </button>
      </form>
    </div>
  );
}
