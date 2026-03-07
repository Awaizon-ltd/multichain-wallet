import { getDatabase } from "./Database";


// Get last read timestamp for a guild
export const getLastReadTimestamp = async (guildId, userUid) => {
  const db = getDatabase();
  const result = await db.getFirstAsync(
    'SELECT last_read_timestamp FROM chat_read_status WHERE guild_id = ? AND user_uid = ?',
    [guildId, userUid]
  );
  return result?.last_read_timestamp || 0;
};

// Update last read timestamp (call when user opens or views chat)
export const updateLastReadTimestamp = async (guildId, userUid, timestamp = null) => {
  const db = getDatabase();
  const readTime = timestamp || Date.now();
  
  await db.runAsync(
    `INSERT OR REPLACE INTO chat_read_status 
    (guild_id, user_uid, last_read_timestamp) 
    VALUES (?, ?, ?)`,
    [guildId, userUid, readTime]
  );
};

// Get unread message count for a guild
export const getUnreadMessageCount = async (guildId, userUid) => {
  const db = getDatabase();
  
  // Get last read timestamp
  const lastRead = await getLastReadTimestamp(guildId, userUid);
  
  // Count messages after that timestamp (excluding user's own messages)
  const result = await db.getFirstAsync(
    `SELECT COUNT(*) as count FROM chat_messages 
     WHERE guild_id = ? 
     AND created_at > ? 
     AND user_id != ?`,
    [guildId, lastRead, userUid]
  );
  
  return result?.count || 0;
};

// Get unread counts for all guilds
export const getAllUnreadCounts = async (userUid) => {
  const db = getDatabase();
  
  const results = await db.getAllAsync(
    `SELECT 
      cm.guild_id,
      COUNT(*) as unread_count
    FROM chat_messages cm
    LEFT JOIN chat_read_status crs 
      ON cm.guild_id = crs.guild_id AND crs.user_uid = ?
    WHERE cm.user_id != ?
    AND cm.created_at > COALESCE(crs.last_read_timestamp, 0)
    GROUP BY cm.guild_id`,
    [userUid, userUid]
  );
  
  // Convert to object for easy lookup
  const unreadMap = {};
  results.forEach(row => {
    unreadMap[row.guild_id] = row.unread_count;
  });
  
  return unreadMap;
};

// Mark all messages as read for a guild
export const markAllAsRead = async (guildId, userUid) => {
  await updateLastReadTimestamp(guildId, userUid, Date.now());
};