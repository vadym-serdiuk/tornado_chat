var ws = null;
var rooms = new Array();

$(document).ready(function(){

    connect_to_server();

    $('a.register_link').on('click', function(e){
        e.preventDefault();
        show_signup()
    });

    //Opens login dialog
    $('a.login_link').on('click', function(e){
        e.preventDefault();
        show_login()
    });

    //Initiates send login data
    $('#login_form').on('submit', function(e){
        e.preventDefault();

        data = {
            username: $('#login_username').val(),
            password: $('#login_password').val()
        };

        $.ajax({
            data: data,
            url: '/login',
            method: 'POST',
            dataType: 'json',
            success: function(data){
                $('#login_form')[0].reset();
                if (data.status == 'success')
                    connect_to_server();
                else
                    show_error(data.message);
            },
            error: function(error){
                show_error(error);
            }
       });
    });

    //Initiates send registration data
    $('#signup_form').on('submit', function(e){
        e.preventDefault();
        username = $('#reg_username').val();
        password = $('#reg_password1').val();
        if (password != $('#reg_password2').val()){
            show_error('passwords do not match. Please check');
        }

        data = {
            username: username,
            password: password
        };

        $.ajax({
            data: data,
            url: '/signup',
            method: 'POST',
            dataType: 'json',
            success: function(data){
                $('#signup_form')[0].reset();
                if (data.status == 'success')
                    connect_to_server();
                else
                    show_error(data.message);
            },
            error: function(error){
                show_error(error);
            }
       });
    });

    $('.dropdown-menu').find('form').click(function (e) {
        e.stopPropagation();
    });

    $('form.create_room').on('submit', function(e){
        e.preventDefault();
        create_room();
    });

    $('#join_room').on('click', function(){
        join_room();
    });

    $('#leave_room').on('click', function(){
        leave_room();
    });

    $('.send_message').submit('click', function(e){
        e.preventDefault();
        text = $('#newmessage').val();
        if (text == '') return;

        room = $('.room.active');
        if (room.length > 0) {
            if (!room.hasClass('joined')) {
                show_error('Selected room is not joined');
                return;
            }
        }else{
                show_error('There is no room selected');
            }
        data = {
            text: text,
            room: room.data('roomCode')
        };
        ws.send(JSON.stringify(data));
        if (ws.bufferedAmount == 0){
            $('#newmessage').val('')
        }else{
            show_error('Something wrong');
        }
    });

    $(document).on('click', '.room a', function(e){
        e.preventDefault();
        $('.active').removeClass('active');
        li_el = $(this).parent();
        li_el.addClass('active');

        $('.badge', li_el).remove();
        if (li_el.hasClass('joined')) {
            room = li_el.data('roomCode');
            show_room(room);
        }else{
            $('.messages').addClass('invisible');
        }
    })
});

function ping(){
  if (ws){
    ws.send('/ping');
    setTimeout(ping, 50000);
  }
}

function show_login(){
    $('.window').hide();
    $('#login').fadeIn().removeClass('invisible');
}

function show_signup(){
    $('.window').hide();
    $('#signup').fadeIn().removeClass('invisible');
}

function show_chat(){
    $('.window').hide();
    $('#chat').fadeIn().removeClass('invisible');
}

function reload_rooms(){
    ws.send('/rooms');
}

function onmessage(event){
    data = JSON.parse(event.data);
    if ('server_event' in data){
        if (data.server_event == 'room_created'){
            $('.btn-group').removeClass('open');
            reload_rooms();
            return;
        }
        if (data.server_event == 'room_joined'){
            $('.room[data-room-code="'+data.room+'"]').addClass('joined');
            show_room(data.room);
            return;
        }
        if (data.server_event == 'rooms_list'){
            update_rooms_list(data.list);
            return;
        }
        if (data.server_event == 'room_left'){
            $('.room[data-room-code="'+data.room+'"]').removeClass('joined');
            $('.messages.'+data.room).addClass('invisible');
            return;
        }

    }

    if ('status' in data) {
        if (data.status == 'error'){
            show_error(data.message);
            return;
        }
        return;
    }

    if ('text' in data){
        data.time = new Date(data.time);
        html = '<p class="message"><span class="username">' + data.username +
         '</span><span class="time">' + data.time.toTimeString().substring(0,8) +
         '</span><span class="text">' + data.text + '</span>';
        current_window = $('.messages.'+data.room);
        if (current_window.length > 0) {
            current_window.append(html);
            current_window.scrollTop(current_window[0].scrollHeight);
            if (current_window.hasClass('invisible')) {
                room_link = $('.room[data-room-code="' + data.room + '"] a');
                unread_messages = $('.badge', room_link);
                if (unread_messages.length > 0) {
                    i = parseInt(unread_messages.html());
                    unread_messages.html(++i);
                }
                else {
                    room_link.append('<span class="badge pull-right">1</span>');
                }
            }
        }
    }
}

function onclose(event){
    show_error(event.reason || 'Unexpected error');
    ws = null;
    document.cookie = 'session=; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    $('.room').removeClass('joined').removeClass('active');
    $('.messages').remove();
    show_login();
}

function onopen(){
    reload_rooms();
    show_chat();
    setTimeout(ping, 50000);
}

function show_room(room){
    $('.messages').addClass('invisible');
    room_messages = $('.messages.'+room);
    room_messages.removeClass('invisible');
    room_messages.scrollTop(room_messages[0].scrollHeight);
}

function check_room_name(room){
    return room.match(/^[a-zA-Z]+[\w\s]{0,30}$/) != null;
}

function connect_to_server(){
    url = location.hostname+(location.port ? ':'+location.port: '');
    ws = new WebSocket('ws://' + url + '/chat');
    ws.onclose = onclose;
    ws.onmessage = onmessage;
    ws.onopen = onopen;
}

function create_room(){
    room = $('#room_name').val();
    if (check_room_name(room))
        ws.send('/create ' + room);
    else
        show_error('Room name is wrong');
}

function join_room(){
    room_code = $('.room.active').data('roomCode');
    room_el = $('.room.active')
    if (room_el.hasClass('joined')) return;
    if ($('.messages.'+room_code).length == 0) {
        $('.messages').addClass('invisible');
        $('.messages_wrapper').append('<div class="messages ' + room_code + '"></div>');
    }
    command = '/join ' + room_code;
    ws.send(command);
}

function leave_room(){
    room = $('.room.active');
    if (room.hasClass('joined')) {
        command = '/leave ' + room.data('roomCode');
        ws.send(command);
    }
}

function update_rooms_list(rooms){
    rooms_ul = $('.rooms_list');
    rooms_ul.html('');

    for (i=0; i < rooms.length; i++){
        room = rooms[i];
        el = rooms_ul.append('<li class="room" data-room-code="'+room.code+'"><a href="">'+room.name+'</a></li>');
        if (room.joined) {
            el.addClass('joined');
            if ($('.messages.' + room).length == 0)
                $('.messages_wrapper').append('<div class="messages ' + room + '"></div>');
        }
    }
}

function close_status_line(){
    $('#status_line').fadeOut();
}

function show_error(text){
    console.log(text);
    $('#status_line').html('<div class="error">' + text + '</div>').fadeIn();
    setTimeout(close_status_line, 5000);
}