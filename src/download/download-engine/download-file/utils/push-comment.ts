export function pushComment(newComment: string, comment = "") {
    if (comment.length) {
        return `${newComment}, ${comment}`;
    }
    return newComment;
}
