import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { FlatList, Image, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

const CommentModal = ({ postImage, postUser }) => {
    const [newComment, setNewComment] = useState('');
    const [comments, setComments] = useState([
        { id: '1', user: 'emma_wilson', text: 'This is beautiful! 😍', likes: 12, timeAgo: '2h', userImage: 'https://i.pravatar.cc/150?img=1' },
        { id: '2', user: 'mike_jones', text: 'Amazing shot!', likes: 5, timeAgo: '1h', userImage: 'https://i.pravatar.cc/150?img=2' },
    ]);

    const handleSubmitComment = () => {
        if (newComment.trim()) {
            const comment = {
                id: Date.now().toString(),
                user: 'your_username',
                text: newComment,
                likes: 0,
                timeAgo: 'now',
                userImage: 'https://i.pravatar.cc/150?img=3',
            };
            setComments([comment, ...comments]);
            setNewComment('');
        }
    };

    const renderComment = ({ item }) => (
        <View style={styles.commentItem}>
            <Image source={{ uri: item.userImage }} style={styles.commentUserImage} />
            <View style={styles.commentContent}>
                <Text style={styles.commentText}>
                    <Text style={styles.commentUser}>{item.user}</Text> {item.text}
                </Text>
                <View style={styles.commentMeta}>
                    <Text style={styles.timeAgo}>{item.timeAgo}</Text>
                    {item.likes > 0 && <Text style={styles.likes}>{item.likes} likes</Text>}
                    <TouchableOpacity>
                        <Text style={styles.replyButton}>Reply</Text>
                    </TouchableOpacity>
                </View>
            </View>
            <TouchableOpacity>
                <Ionicons name="heart-outline" size={16} color="gray" />
            </TouchableOpacity>
        </View>
    );

    return (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : null} style={styles.modalContainer}>
            {/* Header */}
            <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Comments</Text>
            </View>

            {/* Post Preview */}
            <View style={styles.postPreview}>
                <Image source={{ uri: postImage }} style={styles.postPreviewImage} />
                <View>
                    <Text style={styles.postUser}>{postUser}</Text>
                    <Text style={styles.originalPost}>Original post</Text>
                </View>
            </View>

            {/* Comments List */}
            <FlatList
                data={comments}
                renderItem={renderComment}
                keyExtractor={(item) => item.id}
                style={styles.commentsList}
                contentContainerStyle={{ paddingBottom: 16 }}
            />

            {/* Comment Input */}
            <View style={styles.commentInput}>
                <Image source={{ uri: 'https://i.pravatar.cc/150?img=3' }} style={styles.yourAvatar} />
                <TextInput
                    style={styles.textInput}
                    placeholder="Add a comment..."
                    value={newComment}
                    onChangeText={setNewComment}
                    onSubmitEditing={handleSubmitComment}
                />
                {newComment.trim() && (
                    <TouchableOpacity onPress={handleSubmitComment}>
                        <Text style={styles.postButton}>Post</Text>
                    </TouchableOpacity>
                )}
            </View>
        </KeyboardAvoidingView>
    );
};

export default CommentModal;

const styles = StyleSheet.create({
    modalContainer: {
        backgroundColor: 'white',
        height: '100%',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 0.5,
        borderBottomColor: '#ddd',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    postPreview: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 0.5,
        borderBottomColor: '#ddd',
    },
    postPreviewImage: {
        width: 48,
        height: 48,
        borderRadius: 8,
        marginRight: 12,
    },
    postUser: {
        fontWeight: 'bold',
        fontSize: 14,
    },
    originalPost: {
        fontSize: 12,
        color: 'gray',
    },
    commentsList: {
        flex: 1,
    },
    commentItem: {
        flexDirection: 'row',
        padding: 16,
        alignItems: 'flex-start',
    },
    commentUserImage: {
        width: 32,
        height: 32,
        borderRadius: 16,
        marginRight: 12,
    },
    commentContent: {
        flex: 1,
    },
    commentText: {
        fontSize: 14,
    },
    commentUser: {
        fontWeight: 'bold',
    },
    commentMeta: {
        flexDirection: 'row',
        marginTop: 4,
        gap: 16,
    },
    timeAgo: {
        fontSize: 12,
        color: 'gray',
    },
    likes: {
        fontSize: 12,
        color: 'gray',
    },
    replyButton: {
        fontSize: 12,
        color: 'gray',
        fontWeight: '500',
    },
    commentInput: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderTopWidth: 0.5,
        borderTopColor: '#ddd',
        gap: 12,
    },
    yourAvatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
    },
    textInput: {
        flex: 1,
        fontSize: 14,
        padding: 8,
    },
    postButton: {
        color: '#0095f6',
        fontWeight: 'bold',
        fontSize: 14,
    },
});